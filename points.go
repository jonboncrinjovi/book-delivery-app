package main

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// GET /api/me/points: all книвиночки earned in the games, and today's
// (until spending exists, the balance is simply everything earned)
func myPoints(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		var total, today int64
		pool.QueryRow(r.Context(), `
			SELECT COALESCE(SUM(score), 0),
			       COALESCE(SUM(score) FILTER (WHERE (finished_at AT TIME ZONE 'Europe/Moscow')::date = (now() AT TIME ZONE 'Europe/Moscow')::date), 0)
			FROM game_scores WHERE user_id = $1`, uid).Scan(&total, &today)
		writeJSON(w, http.StatusOK, map[string]int64{"total": total, "today": today})
	}
}
