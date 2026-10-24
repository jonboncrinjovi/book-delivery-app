package main

import (
	"context"
	"crypto/subtle"
	"embed"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

// bake the migration files into the binary, so the container needs nothing else
//go:embed migrations/*.sql
var migrations embed.FS

// Book mirrors one row of the books table; the json tags set field names in API responses
type Book struct {
	ID         int64     `json:"id"`
	Title      string    `json:"title"`
	Author     string    `json:"author"`
	PriceCents int       `json:"price_cents"`
	Stock      int       `json:"stock"`
	CreatedAt  time.Time `json:"created_at"`
}

func main() {
	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	// bring the schema up to date on every start; already-applied migrations are skipped
	if err := migrate(pool); err != nil {
		log.Fatal(err)
	}

	adminToken := os.Getenv("ADMIN_TOKEN")

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health(pool))
	mux.HandleFunc("GET /books", listBooks(pool))
	mux.HandleFunc("POST /books", requireAdmin(adminToken, createBook(pool)))

	log.Println("listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

func migrate(pool *pgxpool.Pool) error {
	db := stdlib.OpenDBFromPool(pool) // goose speaks database/sql; this adapts the pgx pool to it
	defer db.Close()
	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.Up(db, "migrations")
}

// requireAdmin wraps a handler: requests without the correct X-Admin-Token header get 401
func requireAdmin(token string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		got := r.Header.Get("X-Admin-Token")
		// constant-time comparison, so response timing doesn't leak how much of the token matched
		if token == "" || subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func health(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := pool.Ping(ctx); err != nil {
			http.Error(w, "db down", http.StatusServiceUnavailable)
			return
		}
		w.Write([]byte("ok\n"))
	}
}

func listBooks(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := pool.Query(r.Context(),
			`SELECT id, title, author, price_cents, stock, created_at FROM books ORDER BY id`)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		// map each row onto a Book by column order
		books, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Book])
		if err != nil {
			http.Error(w, "read failed", http.StatusInternalServerError)
			return
		}
		if books == nil {
			books = []Book{} // return [] instead of null when the table is empty
		}
		writeJSON(w, http.StatusOK, books)
	}
}

func createBook(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var b Book
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if b.Title == "" || b.Author == "" || b.PriceCents < 0 || b.Stock < 0 {
			http.Error(w, "title and author required; price and stock must be >= 0", http.StatusBadRequest)
			return
		}
		// $1..$4 are placeholders: values are sent separately from the SQL, which prevents SQL injection
		err := pool.QueryRow(r.Context(),
			`INSERT INTO books (title, author, price_cents, stock)
			 VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
			b.Title, b.Author, b.PriceCents, b.Stock,
		).Scan(&b.ID, &b.CreatedAt)
		if err != nil {
			http.Error(w, "insert failed", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, b)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
