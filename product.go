package main

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ProductCard struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	Author      *string `json:"author"`
	Description string  `json:"description"`
	Hook        string  `json:"hook"`
	PriceCents  int     `json:"price_cents"`
	Category    string  `json:"category"`
	Slots       int     `json:"slots"`
	Available   bool    `json:"available"`
	Cover       *string `json:"cover"`
}

// GET /api/products/{id}: everything the book page shows
func productCard(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil {
			http.Error(w, "Нет такого товара", http.StatusNotFound)
			return
		}
		var p ProductCard
		var cover *string
		err = pool.QueryRow(r.Context(), `
			SELECT id, name, author, description, hook, price_cents, category::text, slots, stock > 0, cover_path
			FROM products WHERE id = $1 AND active`, id).Scan(
			&p.ID, &p.Name, &p.Author, &p.Description, &p.Hook, &p.PriceCents, &p.Category, &p.Slots, &p.Available, &cover)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Нет такого товара", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Не получилось загрузить товар", http.StatusInternalServerError)
			return
		}
		p.Cover = mediaURL(cover)
		writeJSON(w, http.StatusOK, p)
	}
}

type BookHit struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	Author *string `json:"author"`
	Cover  *string `json:"cover"`
}

// GET /api/books/find?q=: suggestions for the search bar on the reviews page, books only
func findBooks(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		hits := []BookHit{}
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if len([]rune(q)) < 2 {
			writeJSON(w, http.StatusOK, hits)
			return
		}
		rows, err := pool.Query(r.Context(), `
			SELECT id, name, author, cover_path FROM products
			WHERE active AND category = 'book'
			  AND (name ILIKE '%' || $1 || '%' OR author ILIKE '%' || $1 || '%')
			ORDER BY name LIMIT 8`, q)
		if err != nil {
			http.Error(w, "Не получилось найти", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var h BookHit
			var cover *string
			if rows.Scan(&h.ID, &h.Name, &h.Author, &cover) == nil {
				h.Cover = mediaURL(cover)
				hits = append(hits, h)
			}
		}
		writeJSON(w, http.StatusOK, hits)
	}
}
