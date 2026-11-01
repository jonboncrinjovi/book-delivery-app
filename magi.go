package main

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// one note pinned around the blind card
type Magi struct {
	Text   string  `json:"text"`
	Author string  `json:"author"` // empty for quotes
	Grapes float64 `json:"grapes"` // average rating; 0 for quotes
	Plaque bool    `json:"plaque"` // holds the Золотая лоза
	Quote  bool    `json:"quote"`  // a quote from the book rather than a review
}

const magiCount = 4

// magiNotes: the best non-spoiler reviews (plaque first, then average), topped up with quotes,
// with the title and author blacked out so the blind date stays blind
func magiNotes(ctx context.Context, pool *pgxpool.Pool, bookID int64) ([]Magi, error) {
	var title, author string
	if err := pool.QueryRow(ctx,
		`SELECT name, coalesce(author, '') FROM products WHERE id = $1`, bookID).Scan(&title, &author); err != nil {
		return nil, err
	}

	notes := []Magi{}
	rows, err := pool.Query(ctx, `
		SELECT r.text, u.display_name,
		       coalesce(avg(v.grapes), 0)::float8,
		       (count(v.grapes) >= s.plaque_min_votes AND coalesce(avg(v.grapes), 0) >= s.plaque_min_avg)
		FROM reviews r
		JOIN users u ON u.id = r.user_id
		CROSS JOIN settings s
		LEFT JOIN review_votes v ON v.review_id = r.id
		WHERE r.product_id = $1 AND r.status = 'published' AND NOT r.spoiler
		GROUP BY r.id, u.id, s.id
		ORDER BY 4 DESC, 3 DESC, count(v.grapes) DESC
		LIMIT $2`, bookID, magiCount)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var m Magi
		if err := rows.Scan(&m.Text, &m.Author, &m.Grapes, &m.Plaque); err == nil {
			m.Text = maskTitle(m.Text, title, author)
			notes = append(notes, m)
		}
	}
	rows.Close()

	if len(notes) < magiCount {
		rows, err := pool.Query(ctx, `
			SELECT text FROM book_quotes WHERE product_id = $1 ORDER BY random() LIMIT $2`,
			bookID, magiCount-len(notes))
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var text string
			if err := rows.Scan(&text); err == nil {
				notes = append(notes, Magi{Text: text, Quote: true})
			}
		}
		rows.Close()
	}
	return notes, nil
}
