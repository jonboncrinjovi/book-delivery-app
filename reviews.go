package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// one review as the feed shows it
type Review struct {
	ID        int64     `json:"id"`
	ProductID int64     `json:"product_id"`
	Book      string    `json:"book"`
	Author    string    `json:"author"` // the reviewer's display name
	Text      string    `json:"text"`
	Avg       float64   `json:"avg"`     // average grapes, 0 when nobody voted yet
	Votes     int       `json:"votes"`
	Plaque    bool      `json:"plaque"`  // the gold "Золотая лоза" plaque
	MyVote    *int      `json:"my_vote"` // the viewer's own vote, if any
	Mine      bool      `json:"mine"`    // written by the viewer
	CreatedAt time.Time `json:"created_at"`
}

// $1 is the viewer's user id (0 for guests, which matches nobody).
// CROSS JOIN settings attaches the single settings row to every review, for the plaque thresholds.
const reviewSelect = `
	SELECT r.id, r.product_id, p.name, u.display_name, r.text,
	       coalesce(avg(v.grapes), 0)::float8,
	       count(v.grapes)::int,
	       (count(v.grapes) >= s.plaque_min_votes AND coalesce(avg(v.grapes), 0) >= s.plaque_min_avg),
	       max(CASE WHEN v.user_id = $1 THEN v.grapes END)::int,
	       r.user_id = $1,
	       coalesce(r.published_at, r.created_at)
	FROM reviews r
	JOIN products p ON p.id = r.product_id
	JOIN users u ON u.id = r.user_id
	CROSS JOIN settings s
	LEFT JOIN review_votes v ON v.review_id = r.id
	WHERE r.status = 'published'`

const reviewGroup = ` GROUP BY r.id, p.id, u.id, s.id`

// listReviews: GET /api/reviews (latest) or /api/reviews?product=12 (best first, for one book)
func listReviews(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := userID(r.Context(), pool, r)
		if pid, err := strconv.ParseInt(r.URL.Query().Get("product"), 10, 64); err == nil {
			// ORDER BY 8, 6: by column position, the plaque first, then the average
			listJSON[Review](pool, w, r, reviewSelect+` AND r.product_id = $2`+reviewGroup+
				` ORDER BY 8 DESC, 6 DESC LIMIT 50`, uid, pid)
			return
		}
		listJSON[Review](pool, w, r, reviewSelect+reviewGroup+` ORDER BY 11 DESC LIMIT 50`, uid)
	}
}

type Activity struct {
	Who  string    `json:"who"`
	Book string    `json:"book"`
	At   time.Time `json:"at"`
}

// reviewActivity: GET /api/reviews/activity, the log strip's latest entries
func reviewActivity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		listJSON[Activity](pool, w, r, `
			SELECT u.display_name, p.name, r.published_at
			FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id
			WHERE r.status = 'published'
			ORDER BY r.published_at DESC LIMIT 20`)
	}
}

type BookRef struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// reviewableBooks: GET /api/me/reviewable, books this user read or bought and hasn't reviewed yet
func reviewableBooks(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		listJSON[BookRef](pool, w, r, `
			SELECT p.id, p.name FROM products p
			WHERE p.category = 'book'
			  AND (EXISTS (SELECT 1 FROM book_reads b WHERE b.user_id = $1 AND b.product_id = p.id)
			       OR EXISTS (SELECT 1 FROM order_items i JOIN orders o ON o.id = i.order_id
			                  WHERE o.user_id = $1 AND i.product_id = p.id AND o.status <> 'cancelled'))
			  AND NOT EXISTS (SELECT 1 FROM reviews rv WHERE rv.user_id = $1 AND rv.product_id = p.id)
			ORDER BY p.name`, uid)
	}
}

// createReview: POST /api/reviews with {product_id, text}; goes to moderation
func createReview(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		var body struct {
			ProductID int64  `json:"product_id"`
			Text      string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Некорректный запрос", http.StatusBadRequest)
			return
		}
		text := strings.TrimSpace(body.Text)
		if n := utf8.RuneCountInString(text); n < 10 || n > 200 {
			http.Error(w, "От 10 до 200 символов", http.StatusBadRequest)
			return
		}
		ctx := r.Context()

		// only readers and buyers may review
		var eligible bool
		if err := pool.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM book_reads WHERE user_id = $1 AND product_id = $2)
			    OR EXISTS (SELECT 1 FROM order_items i JOIN orders o ON o.id = i.order_id
			               WHERE o.user_id = $1 AND i.product_id = $2 AND o.status <> 'cancelled')`,
			uid, body.ProductID).Scan(&eligible); err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		if !eligible {
			http.Error(w, "Сначала отметь книгу как прочитанную", http.StatusForbidden)
			return
		}

		var id int64
		err := pool.QueryRow(ctx, `
			INSERT INTO reviews (user_id, product_id, text) VALUES ($1, $2, $3)
			ON CONFLICT (user_id, product_id) DO NOTHING
			RETURNING id`, uid, body.ProductID, text).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) { // the conflict case: nothing inserted
			http.Error(w, "Ты уже писал рецензию на эту книгу", http.StatusConflict)
			return
		}
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		go notifyReview(pool, id)
		writeJSON(w, http.StatusCreated, map[string]string{"status": "pending"})
	}
}

// voteReview: POST /api/reviews/{id}/vote with {grapes: 1..5}
func voteReview(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil {
			http.Error(w, "bad id", http.StatusBadRequest)
			return
		}
		var body struct {
			Grapes int `json:"grapes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Grapes < 1 || body.Grapes > 5 {
			http.Error(w, "Оценка от 1 до 5", http.StatusBadRequest)
			return
		}
		// the SELECT only yields a row for a published review written by someone else,
		// so voting on your own (or an unpublished) review inserts nothing
		tag, err := pool.Exec(r.Context(), `
			INSERT INTO review_votes (review_id, user_id, grapes)
			SELECT id, $2, $3 FROM reviews WHERE id = $1 AND status = 'published' AND user_id <> $2
			ON CONFLICT (review_id, user_id) DO UPDATE SET grapes = EXCLUDED.grapes`,
			id, uid, body.Grapes)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		if tag.RowsAffected() == 0 {
			http.Error(w, "Эту рецензию нельзя оценить", http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// maskTitle blacks out the book's title, its longer title words, the author's name and surname,
// so a review can't give away a blind-date book by accident
func maskTitle(text, title, author string) string {
	terms := []string{title, author}
	for _, word := range strings.Fields(title) {
		if utf8.RuneCountInString(word) >= 5 { // short words like "и", "в" would mask half the text
			terms = append(terms, word)
		}
	}
	if parts := strings.Fields(author); len(parts) > 1 {
		terms = append(terms, parts[len(parts)-1]) // the surname alone
	}
	for _, t := range terms {
		if utf8.RuneCountInString(t) < 3 {
			continue
		}
		// (?i): case-insensitive; QuoteMeta: treat the term as plain text, not as regex syntax
		re := regexp.MustCompile(`(?i)` + regexp.QuoteMeta(t))
		text = re.ReplaceAllString(text, "▒▒▒")
	}
	return text
}

// magiLines: the three voices for a masked card. Best non-spoiler reviews first, quotes fill the gaps.
func magiLines(ctx context.Context, pool *pgxpool.Pool, bookID int64) ([]string, error) {
	var title, author string
	if err := pool.QueryRow(ctx,
		`SELECT name, coalesce(author, '') FROM products WHERE id = $1`, bookID).Scan(&title, &author); err != nil {
		return nil, err
	}

	lines := []string{}
	rows, err := pool.Query(ctx, `
		SELECT r.text, u.display_name
		FROM reviews r
		JOIN users u ON u.id = r.user_id
		LEFT JOIN review_votes v ON v.review_id = r.id
		WHERE r.product_id = $1 AND r.status = 'published' AND NOT r.spoiler
		GROUP BY r.id, u.id
		ORDER BY coalesce(avg(v.grapes), 0) DESC, count(v.grapes) DESC
		LIMIT 3`, bookID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var text, who string
		if err := rows.Scan(&text, &who); err == nil {
			lines = append(lines, maskTitle(text, title, author)+" — "+who)
		}
	}
	rows.Close()

	if len(lines) < 3 {
		rows, err := pool.Query(ctx, `
			SELECT text FROM book_quotes WHERE product_id = $1 ORDER BY random() LIMIT $2`,
			bookID, 3-len(lines))
		if err != nil {
			return nil, err
		}
		quotes, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return nil, err
		}
		lines = append(lines, quotes...)
	}
	return lines, nil
}

// notifyReview sends a new review to your Telegram with moderation buttons
func notifyReview(pool *pgxpool.Pool, id int64) {
	token, chatID := os.Getenv("TELEGRAM_BOT_TOKEN"), os.Getenv("TELEGRAM_CHAT_ID")
	if token == "" || chatID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var book, who, text string
	if err := pool.QueryRow(ctx, `
		SELECT p.name, u.display_name, r.text
		FROM reviews r JOIN products p ON p.id = r.product_id JOIN users u ON u.id = r.user_id
		WHERE r.id = $1`, id).Scan(&book, &who, &text); err != nil {
		log.Printf("notify review %d: %v", id, err)
		return
	}
	msg := fmt.Sprintf("Новая рецензия #%d\nКнига: %s\nОт: %s\n\n«%s»", id, book, who, text)
	kb := map[string]any{"inline_keyboard": [][]map[string]string{
		{
			{"text": "Опубликовать", "callback_data": fmt.Sprintf("rv:%d:publish", id)},
			{"text": "Спойлер", "callback_data": fmt.Sprintf("rv:%d:spoiler", id)},
		},
		{{"text": "Отклонить", "callback_data": fmt.Sprintf("rv:%d:reject", id)}},
	}}
	if err := tgCall(ctx, token, "sendMessage",
		map[string]any{"chat_id": chatID, "text": msg, "reply_markup": kb}, nil); err != nil {
		log.Printf("notify review %d: %v", id, err)
	}
}

// moderateReview applies your Telegram decision; only pending reviews can be decided
func moderateReview(ctx context.Context, pool *pgxpool.Pool, id int64, action string) error {
	var sql string
	switch action {
	case "publish":
		sql = `UPDATE reviews SET status = 'published', published_at = now() WHERE id = $1 AND status = 'pending'`
	case "spoiler":
		sql = `UPDATE reviews SET status = 'published', spoiler = true, published_at = now() WHERE id = $1 AND status = 'pending'`
	case "reject":
		sql = `UPDATE reviews SET status = 'rejected' WHERE id = $1 AND status = 'pending'`
	default:
		return errors.New("unknown action")
	}
	tag, err := pool.Exec(ctx, sql, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errStatusMoved
	}
	return nil
}
