package main

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
)

type SearchHit struct {
	ID         int64   `json:"id"`
	Category   string  `json:"category"`
	Name       string  `json:"name"`
	Author     *string `json:"author"`
	PriceCents int     `json:"price_cents"`
	Slots      int     `json:"slots"`
	Image      *string `json:"image"`
}

// % and _ are wildcards in LIKE patterns; escaping them means a search for "50%" finds literally "50%"
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// searchProducts: GET /api/search?q=...
// matches title, author, description, tag names, and Russian category words ("цветы", "вино")
func searchProducts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if utf8.RuneCountInString(q) < 2 { // one letter would match nearly everything
			writeJSON(w, http.StatusOK, []SearchHit{})
			return
		}
		pattern := "%" + likeEscaper.Replace(q) + "%" // %…% = "contains"
		// ILIKE: case-insensitive LIKE. The LEFT JOINs bring in tag names without excluding untagged products;
		// DISTINCT folds the duplicate rows a book with several matching tags would produce.
		listJSON[SearchHit](pool, w, r, `
			SELECT DISTINCT p.id, p.category::text, p.name, p.author, p.price_cents, p.slots,
			       '/api/media/' || p.cover_path
			FROM products p
			LEFT JOIN book_tags bt ON bt.product_id = p.id
			LEFT JOIN tags t ON t.id = bt.tag_id
			WHERE p.active AND p.stock > 0
			  AND (p.name ILIKE $1 OR p.author ILIKE $1 OR p.description ILIKE $1 OR t.name ILIKE $1
			       OR CASE p.category
			            WHEN 'book' THEN 'книги'
			            WHEN 'stationery' THEN 'канцелярия'
			            WHEN 'drink' THEN 'напитки вино'
			            WHEN 'snack' THEN 'закуски'
			            WHEN 'flowers' THEN 'цветы букеты'
			            WHEN 'games' THEN 'игры настольные'
			            WHEN 'souvenirs' THEN 'сувениры'
			            ELSE '' END ILIKE $1)
			ORDER BY p.name
			LIMIT 40`, pattern)
	}
}
