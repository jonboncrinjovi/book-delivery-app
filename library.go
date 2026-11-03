package main

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type LibBook struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"` // empty for a blind book
	Author *string `json:"author"`
	Cover  *string `json:"cover"`
	Hidden bool    `json:"hidden"`
	Review *string `json:"review"` // null: not reviewed; otherwise the review's status
}

type LibParcel struct {
	Track     string    `json:"track"`
	Status    string    `json:"status"`
	DeliverBy time.Time `json:"deliver_by"`
	Hidden    bool      `json:"hidden"` // a blind book inside
}

type Library struct {
	Kept   []LibBook   `json:"kept"`
	Bought []LibBook   `json:"bought"`
	OnWay  []LibParcel `json:"on_way"`
}

// stored paths are relative ("covers/…jpg"); the server hands them out under /api/media/
func mediaURL(p *string) *string {
	if p == nil || *p == "" {
		return nil
	}
	u := "/api/media/" + *p
	return &u
}

// GET /api/me/library: everything the "Мои книги" shelves show, in one request
func myLibrary(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		uid := userID(ctx, pool, r)
		if uid == 0 {
			http.Error(w, "Войдите через Telegram", http.StatusUnauthorized)
			return
		}
		lib := Library{Kept: []LibBook{}, Bought: []LibBook{}, OnWay: []LibParcel{}}
		fail := func() { http.Error(w, "Не получилось загрузить полки", http.StatusInternalServerError) }

		// 1. kept and not in any live order yet; a blind book keeps its secret
		rows, err := pool.Query(ctx, `
			SELECT p.id, s.hidden,
			       CASE WHEN s.hidden THEN '' ELSE p.name END,
			       CASE WHEN s.hidden THEN NULL ELSE p.author END,
			       CASE WHEN s.hidden THEN NULL ELSE p.cover_path END
			FROM shelf s JOIN products p ON p.id = s.product_id
			WHERE s.user_id = $1 AND NOT EXISTS (
				SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
				WHERE o.user_id = $1 AND oi.product_id = s.product_id AND o.status <> 'cancelled')
			ORDER BY s.created_at DESC`, uid)
		if err != nil {
			fail()
			return
		}
		for rows.Next() {
			var b LibBook
			var cover *string
			if rows.Scan(&b.ID, &b.Hidden, &b.Name, &b.Author, &cover) == nil {
				b.Cover = mediaURL(cover)
				lib.Kept = append(lib.Kept, b)
			}
		}
		rows.Close()

		// 2 and 3. books from delivered orders (revealed by now), with the review status if there is one
		rows, err = pool.Query(ctx, `
			SELECT DISTINCT ON (p.id) p.id, p.name, p.author, p.cover_path, r.status::text
			FROM order_items oi
			JOIN orders o ON o.id = oi.order_id
			JOIN products p ON p.id = oi.product_id
			LEFT JOIN reviews r ON r.product_id = p.id AND r.user_id = $1
			WHERE o.user_id = $1 AND o.status = 'delivered' AND p.category = 'book'
			ORDER BY p.id, o.created_at DESC`, uid)
		if err != nil {
			fail()
			return
		}
		for rows.Next() {
			var b LibBook
			var cover *string
			if rows.Scan(&b.ID, &b.Name, &b.Author, &cover, &b.Review) == nil {
				b.Cover = mediaURL(cover)
				lib.Bought = append(lib.Bought, b)
			}
		}
		rows.Close()

		// 4. orders still on their way
		rows, err = pool.Query(ctx, `
			SELECT o.track_token, o.status::text, o.deliver_by, bool_or(oi.hidden)
			FROM orders o JOIN order_items oi ON oi.order_id = o.id
			WHERE o.user_id = $1 AND o.status NOT IN ('delivered', 'cancelled')
			GROUP BY o.id
			ORDER BY o.created_at DESC`, uid)
		if err != nil {
			fail()
			return
		}
		for rows.Next() {
			var p LibParcel
			if rows.Scan(&p.Track, &p.Status, &p.DeliverBy, &p.Hidden) == nil {
				lib.OnWay = append(lib.OnWay, p)
			}
		}
		rows.Close()

		writeJSON(w, http.StatusOK, lib)
	}
}
