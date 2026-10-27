package main

import (
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TrackItem struct {
	Name     string `json:"name"`
	Quantity int    `json:"quantity"`
}

type TrackEvent struct {
	Status string    `json:"status"`
	At     time.Time `json:"at"`
}

type Tracking struct {
	ID           int64        `json:"id"`
	Status       string       `json:"status"`
	DeliveryType string       `json:"delivery_type"`
	DeliverBy    time.Time    `json:"deliver_by"`
	TotalCents   int          `json:"total_cents"`
	CreatedAt    time.Time    `json:"created_at"`
	Items        []TrackItem  `json:"items"`
	Events       []TrackEvent `json:"events"`
}

// trackOrder: GET /api/track/{token}
// public, but only for whoever has the secret link. Shows no address or phone,
// and blind books stay "Книга-сюрприз".
func trackOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		var t Tracking
		err := pool.QueryRow(ctx, `
			SELECT id, status::text, delivery_type::text, deliver_by, total_cents, created_at
			FROM orders WHERE track_token = $1`, r.PathValue("token")).Scan(
			&t.ID, &t.Status, &t.DeliveryType, &t.DeliverBy, &t.TotalCents, &t.CreatedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Заказ не найден", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}

		rows, err := pool.Query(ctx, `
			SELECT CASE WHEN i.hidden THEN 'Книга-сюрприз' ELSE p.name END, i.quantity
			FROM order_items i JOIN products p ON p.id = i.product_id
			WHERE i.order_id = $1 ORDER BY i.hidden DESC, p.name`, t.ID)
		if err == nil {
			t.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[TrackItem])
		}
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}

		rows, err = pool.Query(ctx, `
			SELECT status::text, at FROM order_events WHERE order_id = $1 ORDER BY at`, t.ID)
		if err == nil {
			t.Events, err = pgx.CollectRows(rows, pgx.RowToStructByPos[TrackEvent])
		}
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		if t.Events == nil {
			t.Events = []TrackEvent{}
		}
		writeJSON(w, http.StatusOK, t)
	}
}
