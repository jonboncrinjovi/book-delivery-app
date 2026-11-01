package main

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ShelfBook struct {
	ID          int64     `json:"id"`
	Name        *string   `json:"name"` // null while it's still a parcel
	Author      *string   `json:"author"`
	Cover       *string   `json:"cover"`
	Hook        string    `json:"hook"`
	Description string    `json:"description"`
	PriceCents  int       `json:"price_cents"`
	Hidden      bool      `json:"hidden"` // still wrapped
	Blind       bool      `json:"blind"`  // was ordered blind (stays true after delivery, for the note)
	Status      string    `json:"status"` // order status; empty for books that are only kept
	Track       string    `json:"track"`  // secret tracking link, for orders
	At          time.Time `json:"at"`
}

type Shelf struct {
	Kept   []ShelfBook `json:"kept"`   // the three upper shelves
	Orders []ShelfBook `json:"orders"` // the bottom shelf
}

// a parcel gives nothing away
func wrap(b *ShelfBook) {
	b.Name, b.Author, b.Cover = nil, nil, nil
	b.Hook, b.Description = "", ""
}

// getShelf: GET /api/me/shelf
func getShelf(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		ctx := r.Context()
		s := Shelf{Kept: []ShelfBook{}, Orders: []ShelfBook{}}
		ordered := map[int64]bool{}

		// ordered books: DISTINCT ON keeps one row per book, its most recent order
		rows, err := pool.Query(ctx, `
			SELECT DISTINCT ON (i.product_id)
			       p.id, p.name, p.author, '/api/media/' || p.cover_path, p.hook, p.description,
			       i.unit_price_cents, i.hidden, o.status::text, o.track_token, o.created_at
			FROM order_items i
			JOIN orders o ON o.id = i.order_id
			JOIN products p ON p.id = i.product_id
			WHERE o.user_id = $1 AND o.status <> 'cancelled' AND p.category = 'book'
			ORDER BY i.product_id, o.created_at DESC`, uid)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		for rows.Next() {
			var b ShelfBook
			if err := rows.Scan(&b.ID, &b.Name, &b.Author, &b.Cover, &b.Hook, &b.Description,
				&b.PriceCents, &b.Blind, &b.Status, &b.Track, &b.At); err != nil {
				continue
			}
			// a blind order unwraps itself once delivered
			b.Hidden = b.Blind && b.Status != "delivered"
			if b.Hidden {
				wrap(&b)
			}
			ordered[b.ID] = true
			s.Orders = append(s.Orders, b)
		}
		rows.Close()
		sort.Slice(s.Orders, func(i, j int) bool { return s.Orders[i].At.After(s.Orders[j].At) }) // newest first

		// kept books, minus any that were since ordered (those live on the bottom shelf)
		rows, err = pool.Query(ctx, `
			SELECT p.id, p.name, p.author, '/api/media/' || p.cover_path, p.hook, p.description,
			       p.price_cents, s.hidden, s.created_at
			FROM shelf s JOIN products p ON p.id = s.product_id
			WHERE s.user_id = $1
			ORDER BY s.created_at DESC`, uid)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		for rows.Next() {
			var b ShelfBook
			if err := rows.Scan(&b.ID, &b.Name, &b.Author, &b.Cover, &b.Hook, &b.Description,
				&b.PriceCents, &b.Hidden, &b.At); err != nil || ordered[b.ID] {
				continue
			}
			b.Blind = b.Hidden
			if b.Hidden {
				wrap(&b)
			}
			s.Kept = append(s.Kept, b)
		}
		rows.Close()
		writeJSON(w, http.StatusOK, s)
	}
}

// putShelf: POST /api/me/shelf with {product_id, hidden}.
// Keeping an already-kept book again can only unwrap it: hidden stays true only if both say so.
func putShelf(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		var body struct {
			ProductID int64 `json:"product_id"`
			Hidden    bool  `json:"hidden"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if _, err := pool.Exec(r.Context(), `
			INSERT INTO shelf (user_id, product_id, hidden)
			SELECT $1, id, $3 FROM products WHERE id = $2 AND category = 'book'
			ON CONFLICT (user_id, product_id) DO UPDATE SET hidden = shelf.hidden AND EXCLUDED.hidden`,
			uid, body.ProductID, body.Hidden); err != nil {
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// deleteShelf: DELETE /api/me/shelf/{id}
func deleteShelf(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil {
			http.Error(w, "bad id", http.StatusBadRequest)
			return
		}
		pool.Exec(r.Context(), `DELETE FROM shelf WHERE user_id = $1 AND product_id = $2`, uid, id)
		w.WriteHeader(http.StatusNoContent)
	}
}
