package main

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Tag struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Children []Tag  `json:"children,omitempty"` // subtags; only anchors have them
}

// what the phone gets before "Раскрыть": no title, no author, no real cover
type MaskedCard struct {
	ID         int64    `json:"id"`
	PriceCents int      `json:"price_cents"`
	CoverBlur  *string  `json:"cover_blur"`
	Hints      []string `json:"hints"`
	Tags       []string `json:"tags"`
	Quotes     []string `json:"quotes"`
}

// what it gets after
type RevealedCard struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	Author      *string `json:"author"`
	Cover       *string `json:"cover"`
	Hook        string  `json:"hook"`
	Description string  `json:"description"`
	PriceCents  int     `json:"price_cents"`
}

// a sommelier suggestion for one pairing step
type Suggestion struct {
	ID          int64   `json:"id"`
	Category    string  `json:"category"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	PriceCents  int     `json:"price_cents"`
	Slots       int     `json:"slots"`
	Image       *string `json:"image"`
	Note        string  `json:"note"` // the sommelier's line; empty when it's a fallback pick
}

// listTags returns anchors, each with its subtags nested inside
func listTags(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := pool.Query(r.Context(), `SELECT id, name, parent_id FROM tags ORDER BY name`)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var anchors []Tag
		children := map[int64][]Tag{} // anchor id → its subtags
		for rows.Next() {
			var t Tag
			var parent *int64
			if err := rows.Scan(&t.ID, &t.Name, &parent); err != nil {
				http.Error(w, "read failed", http.StatusInternalServerError)
				return
			}
			if parent == nil {
				anchors = append(anchors, t)
			} else {
				children[*parent] = append(children[*parent], t)
			}
		}
		// second pass: hang each anchor's subtags on it
		for i := range anchors {
			anchors[i].Children = children[anchors[i].ID]
		}
		if anchors == nil {
			anchors = []Tag{}
		}
		writeJSON(w, http.StatusOK, anchors)
	}
}

// parseIDs turns "3,7,12" into [3 7 12]. Always returns a non-nil slice:
// pgx sends a nil slice as SQL NULL, which would break the queries below.
func parseIDs(s string) ([]int64, error) {
	ids := []int64{}
	for _, part := range strings.Split(s, ",") {
		if part == "" {
			continue
		}
		id, err := strconv.ParseInt(part, 10, 64)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// pickBook: GET /api/sommelier/pick?tags=1,6&exclude=12,17
// books matching more of the chosen tags win; ties are broken at random
func pickBook(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tags, err1 := parseIDs(r.URL.Query().Get("tags"))
		exclude, err2 := parseIDs(r.URL.Query().Get("exclude"))
		if err1 != nil || err2 != nil {
			http.Error(w, "tags and exclude must be comma-separated numbers", http.StatusBadRequest)
			return
		}
		ctx := r.Context()

		var c MaskedCard
		// LEFT JOIN keeps every candidate book, attaching only the tag rows that match;
		// count(bt.tag_id) is then "how many chosen tags this book has"
		err := pool.QueryRow(ctx, `
			SELECT p.id
			FROM products p
			LEFT JOIN book_tags bt ON bt.product_id = p.id AND bt.tag_id = ANY($1)
			WHERE p.category = 'book' AND p.active AND p.stock > 0
			  AND NOT (p.id = ANY($2))
			GROUP BY p.id
			HAVING cardinality($1::bigint[]) = 0 OR count(bt.tag_id) > 0
			ORDER BY count(bt.tag_id) DESC, random()
			LIMIT 1`, tags, exclude).Scan(&c.ID)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "no books left for these tags", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}

		// || joins text; NULL stays NULL, so books without a cover send null
		err = pool.QueryRow(ctx, `
			SELECT price_cents, '/api/media/' || cover_blur_path, hints
			FROM products WHERE id = $1`, c.ID).Scan(&c.PriceCents, &c.CoverBlur, &c.Hints)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}

		// tag names, anchors first
		rows, err := pool.Query(ctx, `
			SELECT t.name FROM book_tags bt JOIN tags t ON t.id = bt.tag_id
			WHERE bt.product_id = $1 ORDER BY t.parent_id NULLS FIRST, t.name`, c.ID)
		if err == nil {
			c.Tags, err = pgx.CollectRows(rows, pgx.RowTo[string])
		}
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}

		// up to three quotes, different ones each time
		rows, err = pool.Query(ctx, `
			SELECT text FROM book_quotes WHERE product_id = $1 ORDER BY random() LIMIT 3`, c.ID)
		if err == nil {
			c.Quotes, err = pgx.CollectRows(rows, pgx.RowTo[string])
		}
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}

		// [] instead of null for empty lists, so the frontend never has to check
		for _, s := range []*[]string{&c.Hints, &c.Tags, &c.Quotes} {
			if *s == nil {
				*s = []string{}
			}
		}
		writeJSON(w, http.StatusOK, c)
	}
}

// revealBook: GET /api/sommelier/reveal/{id}
func revealBook(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64) // {id} from the route pattern
		if err != nil {
			http.Error(w, "bad id", http.StatusBadRequest)
			return
		}
		var c RevealedCard
		err = pool.QueryRow(r.Context(), `
			SELECT id, name, author, '/api/media/' || cover_path, hook, description, price_cents
			FROM products WHERE id = $1 AND category = 'book'`, id).Scan(
			&c.ID, &c.Name, &c.Author, &c.Cover, &c.Hook, &c.Description, &c.PriceCents)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, c)
	}
}

var pairable = map[string]bool{"drink": true, "snack": true, "flowers": true}

// pairProduct: GET /api/sommelier/pair?book=12&category=flowers&occasion=birthday&exclude=4,9
// ranking: fits the occasion → paired with the book's genre → anything else, random within each
func pairProduct(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		book, err := strconv.ParseInt(q.Get("book"), 10, 64)
		if err != nil {
			http.Error(w, "book must be a number", http.StatusBadRequest)
			return
		}
		category := q.Get("category")
		if !pairable[category] {
			http.Error(w, "category must be drink, snack or flowers", http.StatusBadRequest)
			return
		}
		exclude, err := parseIDs(q.Get("exclude"))
		if err != nil {
			http.Error(w, "exclude must be comma-separated numbers", http.StatusBadRequest)
			return
		}

		var s Suggestion
		// the inner SELECT finds the book's anchor genres (tags without a parent)
		err = pool.QueryRow(r.Context(), `
			SELECT p.id, p.category::text, p.name, p.description, p.price_cents, p.slots,
			       '/api/media/' || p.cover_path, coalesce(max(pr.note), '')
			FROM products p
			LEFT JOIN pairings pr ON pr.product_id = p.id AND pr.anchor_tag_id IN (
				SELECT bt.tag_id FROM book_tags bt JOIN tags t ON t.id = bt.tag_id
				WHERE bt.product_id = $1 AND t.parent_id IS NULL)
			LEFT JOIN product_occasions po ON po.product_id = p.id AND po.occasion = $4
			WHERE p.category::text = $2 AND p.active AND p.stock > 0
			  AND NOT (p.id = ANY($3))
			GROUP BY p.id
			ORDER BY count(po.occasion) DESC, count(pr.product_id) DESC, random()
			LIMIT 1`, book, category, exclude, q.Get("occasion")).Scan(
			&s.ID, &s.Category, &s.Name, &s.Description, &s.PriceCents, &s.Slots, &s.Image, &s.Note)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "nothing left in this category", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, s)
	}
}

// mediaHandler serves image files from dir, but refuses folder listings,
// so nobody can browse the covers folder to find originals
func mediaHandler(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.StripPrefix("/api/media/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "" || strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		files.ServeHTTP(w, r)
	}))
}
