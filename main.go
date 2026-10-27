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

// bake the migration files into the binary, so the container needs nothing else
//go:embed migrations/*.sql
var migrations embed.FS

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

	admin := os.Getenv("ADMIN_TOKEN")

	mux := http.NewServeMux()

	// catalogue
	mux.HandleFunc("GET /api/health", health(pool))
	mux.HandleFunc("GET /api/products", listProducts(pool))
	mux.HandleFunc("POST /api/products", requireAdmin(admin, createProduct(pool)))
	mux.HandleFunc("GET /api/box-sizes", listBoxSizes(pool))
	mux.HandleFunc("GET /api/bag-colors", listBagColors(pool))
	mux.HandleFunc("GET /api/designs", listDesigns(pool))
	mux.HandleFunc("GET /api/cards", listCards(pool))
	mux.HandleFunc("GET /api/recipients", listRecipients(pool))
	mux.HandleFunc("GET /api/occasions", listOccasions(pool))

	// sommelier
	mux.HandleFunc("GET /api/tags", listTags(pool))
	mux.HandleFunc("GET /api/sommelier/pick", pickBook(pool))
	mux.HandleFunc("GET /api/sommelier/reveal/{id}", revealBook(pool)) // {id} = a path parameter
	mux.HandleFunc("GET /api/sommelier/pair", pairProduct(pool))

	// orders
	mux.HandleFunc("POST /api/orders", createOrder(pool)) // public: customers place orders
        mux.HandleFunc("GET /api/track/{token}", trackOrder(pool)) // public, via the secret link

        // accounts
	mux.HandleFunc("GET /api/auth/telegram", telegramAuth(pool))
	mux.HandleFunc("POST /api/logout", logout(pool))
	mux.HandleFunc("GET /api/me", requireUser(pool, getMe(pool)))
	mux.HandleFunc("PUT /api/me", requireUser(pool, updateMe(pool)))
	mux.HandleFunc("POST /api/me/reads", requireUser(pool, addRead(pool)))
	mux.HandleFunc("DELETE /api/me/reads/{id}", requireUser(pool, deleteRead(pool)))

	// images
	mux.Handle("GET /api/media/", mediaHandler("/media"))

	go runBot(pool) // background loop waiting for Telegram button taps

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

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
