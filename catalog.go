package main

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Product struct {
	ID          int64     `json:"id"`
	Category    string    `json:"category"`
	Name        string    `json:"name"`
	Author      *string   `json:"author,omitempty"` // pointer = may be NULL; omitted from JSON when empty
	Description string    `json:"description"`
	PriceCents  int       `json:"price_cents"`
	Stock       int       `json:"stock"`
	Slots       int       `json:"slots"`
	CreatedAt   time.Time `json:"created_at"`
}

type BoxSize struct {
	Code          string `json:"code"`
	Name          string `json:"name"`
	CapacitySlots *int   `json:"capacity_slots"` // null for the custom size
	PriceCents    int    `json:"price_cents"`
}

type Design struct {
	ID         int64   `json:"id"`
	Kind       string  `json:"kind"`
	Name       string  `json:"name"`
	ImagePath  *string `json:"image_path"`
	IsCustom   bool    `json:"is_custom"`
	PriceCents int     `json:"price_cents"`
}

// listJSON runs a query and writes every row as a JSON array.
// [T any] is a generic type parameter: one function serves products, box sizes and designs.
func listJSON[T any](pool *pgxpool.Pool, w http.ResponseWriter, r *http.Request, sql string, args ...any) {
	rows, err := pool.Query(r.Context(), sql, args...)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, pgx.RowToStructByPos[T]) // columns map to fields by order
	if err != nil {
		http.Error(w, "read failed", http.StatusInternalServerError)
		return
	}
	if items == nil {
		items = []T{}
	}
	writeJSON(w, http.StatusOK, items)
}

func listProducts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// empty ?category= means "all"; category::text turns the enum into plain text for Go
		listJSON[Product](pool, w, r, `
			SELECT id, category::text, name, author, description, price_cents, stock, slots, created_at
			FROM products
			WHERE active AND ($1 = '' OR category::text = $1)
			ORDER BY category, name`,
			r.URL.Query().Get("category"))
	}
}

func listBoxSizes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		listJSON[BoxSize](pool, w, r, `
			SELECT code, name, capacity_slots, price_cents
			FROM box_sizes
			ORDER BY capacity_slots NULLS LAST`) // S, M, L, then custom
	}
}

func listDesigns(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		listJSON[Design](pool, w, r, `
			SELECT id, kind::text, name, image_path, is_custom, price_cents
			FROM designs
			WHERE active AND ($1 = '' OR kind::text = $1)
			ORDER BY kind, is_custom, name`, // custom entries listed last
			r.URL.Query().Get("kind"))
	}
}

var validCategories = map[string]bool{"book": true, "drink": true, "snack": true, "flowers": true, "other": true}

func createProduct(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var p Product
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		switch {
		case !validCategories[p.Category]:
			http.Error(w, "category must be book, drink, snack, flowers or other", http.StatusBadRequest)
			return
		case p.Name == "" || p.PriceCents < 0 || p.Stock < 0 || p.Slots <= 0:
			http.Error(w, "name required; price and stock >= 0; slots > 0", http.StatusBadRequest)
			return
		case p.Category == "book" && (p.Author == nil || *p.Author == ""):
			http.Error(w, "books need an author", http.StatusBadRequest)
			return
		}
		err := pool.QueryRow(r.Context(), `
			INSERT INTO products (category, name, author, description, price_cents, stock, slots)
			VALUES ($1::product_category, $2, $3, $4, $5, $6, $7)
			RETURNING id, created_at`,
			p.Category, p.Name, p.Author, p.Description, p.PriceCents, p.Stock, p.Slots,
		).Scan(&p.ID, &p.CreatedAt)
		if err != nil {
			http.Error(w, "insert failed", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, p)
	}
}
