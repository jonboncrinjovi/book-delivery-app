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

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrations embed.FS

func main() {
	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	if err := migrate(pool); err != nil {
		log.Fatal(err)
	}

	admin := os.Getenv("ADMIN_TOKEN")

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health(pool))
	mux.HandleFunc("GET /products", listProducts(pool))      // ?category=book to filter
	mux.HandleFunc("POST /products", requireAdmin(admin, createProduct(pool)))
	mux.HandleFunc("GET /box-sizes", listBoxSizes(pool))
	mux.HandleFunc("GET /designs", listDesigns(pool))        // ?kind=card to filter
        mux.HandleFunc("POST /orders", createOrder(pool))       // public: customers place orders
	
        log.Println("listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

func migrate(pool *pgxpool.Pool) error {
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()
	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.Up(db, "migrations")
}

func requireAdmin(token string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		got := r.Header.Get("X-Admin-Token")
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

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
