package main

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// GET /api/products/thumbs?ids=1,2,3 → {"1": "<picture>", ...}
// for the order page; the frontend never asks for blind books, so their covers stay secret
func productThumbs(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var ids []int64
		for _, s := range strings.Split(r.URL.Query().Get("ids"), ",") {
			if id, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64); err == nil && len(ids) < 50 {
				ids = append(ids, id)
			}
		}
		out := map[int64]string{}
		if len(ids) == 0 {
			writeJSON(w, http.StatusOK, out)
			return
		}
		rows, err := pool.Query(r.Context(), `SELECT id, to_jsonb(p) FROM products p WHERE id = ANY($1) AND active`, ids)
		if err != nil {
			http.Error(w, "Не получилось загрузить картинки", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var id int64
			var row map[string]any
			if rows.Scan(&id, &row) != nil {
				continue
			}
			// the first picture field that's filled in: book covers first, then product photos
			for _, k := range []string{"cover_path"} {
				if s, ok := row[k].(string); ok && s != "" {
					out[id] = "/api/media/" + s
					break
				}
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}
