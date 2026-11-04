package main

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// every 10 minutes: cancel orders nobody confirmed within 2 hours, so their items return to stock
func expireUnconfirmed(pool *pgxpool.Pool) {
	for {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		rows, err := pool.Query(ctx, `
			SELECT id FROM orders
			WHERE status = 'awaiting_payment' AND confirmed_at IS NULL
			  AND created_at < now() - interval '2 hours'`)
		if err == nil {
			var ids []int64
			for rows.Next() {
				var id int64
				if rows.Scan(&id) == nil {
					ids = append(ids, id)
				}
			}
			rows.Close()
			for _, id := range ids {
				// the same path as the "Отменить" button: status, event, stock back
				if err := setStatus(ctx, pool, id, "cancelled", []string{"awaiting_payment"}); err != nil && err != errStatusMoved {
					log.Printf("expire: order %d: %v", id, err)
				} else if err == nil {
					log.Printf("expire: order %d cancelled, not confirmed in 2 hours", id)
				}
			}
		} else {
			log.Printf("expire: %v", err)
		}
		cancel()
		time.Sleep(10 * time.Minute)
	}
}
