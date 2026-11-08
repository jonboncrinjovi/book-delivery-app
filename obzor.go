package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
)

type obzorItem struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Book    string `json:"book"`
	Details string `json:"details"`
	ProductID *int64 `json:"product_id"`
}

type obzorResult struct {
	ItemID int64   `json:"item_id"`
	Median float64 `json:"median"`
	Mean   float64 `json:"mean"`
}

type obzorView struct {
	ID       int64         `json:"id"`
	Question string        `json:"question"`
	OpensAt  time.Time     `json:"opens_at"`
	ClosesAt time.Time     `json:"closes_at"`
	Open     bool          `json:"open"`
	Items    []obzorItem   `json:"items"`
	Votes    int           `json:"votes"`
	Results  []obzorResult `json:"results"` // null while open and not yet voted
	Mine     []int64       `json:"mine"`    // this person's order, top first; null if not voted
}

// the logged-in user if there is one, 0 for guests (without sending a 401)
func optUser(r *http.Request, pool *pgxpool.Pool) int64 {
	uid, ok := vtUser(httptest.NewRecorder(), r, pool)
	if !ok {
		return 0
	}
	return uid
}

func obzorLoad(ctx context.Context, pool *pgxpool.Pool, id, uid int64) (obzorView, error) {
	o := obzorView{ID: id, Items: []obzorItem{}}
	if err := pool.QueryRow(ctx, `
		SELECT question, opens_at, closes_at, (opens_at <= now() AND closes_at > now())
		FROM obzors WHERE id = $1 AND opens_at <= now()`, id).Scan(&o.Question, &o.OpensAt, &o.ClosesAt, &o.Open); err != nil {
		return o, err
	}
	rows, err := pool.Query(ctx, `SELECT id, name, book, details, product_id FROM obzor_items WHERE obzor_id = $1 ORDER BY id`, id)
	if err != nil {
		return o, err
	}
	for rows.Next() {
		var it obzorItem
		if rows.Scan(&it.ID, &it.Name, &it.Book, &it.Details, &it.ProductID) == nil {
			o.Items = append(o.Items, it)
		}
	}
	rows.Close()
	pool.QueryRow(ctx, `SELECT count(*) FROM obzor_votes WHERE obzor_id = $1`, id).Scan(&o.Votes)
	if uid != 0 {
		pool.QueryRow(ctx, `SELECT item_ids FROM obzor_votes WHERE user_id = $1 AND obzor_id = $2`, uid, id).Scan(&o.Mine)
	}
	// while voting is open, the results are shown only to those who have voted
	if o.Open && o.Mine == nil {
		return o, nil
	}
	o.Results = []obzorResult{}
	rows, err = pool.Query(ctx, `
		SELECT x.item,
		       percentile_cont(0.5) WITHIN GROUP (ORDER BY x.pos)::float8,
		       avg(x.pos)::float8
		FROM obzor_votes v, unnest(v.item_ids) WITH ORDINALITY AS x(item, pos)
		WHERE v.obzor_id = $1
		GROUP BY x.item ORDER BY 2, 3`, id)
	if err != nil {
		return o, err
	}
	for rows.Next() {
		var x obzorResult
		if rows.Scan(&x.ItemID, &x.Median, &x.Mean) == nil {
			o.Results = append(o.Results, x)
		}
	}
	rows.Close()
	return o, nil
}

func obzorID(r *http.Request) int64 {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id
}

// GET /api/obzor/current: this week's review, or 204 if none is open
func obzorCurrent(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var id int64
		if pool.QueryRow(r.Context(), `
			SELECT id FROM obzors WHERE opens_at <= now() AND closes_at > now()
			ORDER BY opens_at DESC LIMIT 1`).Scan(&id) != nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		o, err := obzorLoad(r.Context(), pool, id, optUser(r, pool))
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, o)
	}
}

// GET /api/obzor/archive: closed reviews, newest first
func obzorArchive(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type brief struct {
			ID       int64     `json:"id"`
			Question string    `json:"question"`
			ClosesAt time.Time `json:"closes_at"`
			Votes    int       `json:"votes"`
		}
		out := []brief{}
		rows, err := pool.Query(r.Context(), `
			SELECT o.id, o.question, o.closes_at, (SELECT count(*) FROM obzor_votes v WHERE v.obzor_id = o.id)
			FROM obzors o WHERE o.closes_at <= now() ORDER BY o.closes_at DESC`)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var b brief
			if rows.Scan(&b.ID, &b.Question, &b.ClosesAt, &b.Votes) == nil {
				out = append(out, b)
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// GET /api/obzor/{id}: one review (current or archived)
func obzorGet(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		o, err := obzorLoad(r.Context(), pool, obzorID(r), optUser(r, pool))
		if err != nil {
			http.Error(w, "Нет такого обзора", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, o)
	}
}

// POST /api/obzor/{id}/vote {"order": [ids, top first]}: every character exactly once, only while open
func obzorVote(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		id := obzorID(r)
		var body struct {
			Order []int64 `json:"order"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			http.Error(w, "Некорректный запрос", http.StatusBadRequest)
			return
		}
		o, err := obzorLoad(r.Context(), pool, id, 0)
		if err != nil {
			http.Error(w, "Нет такого обзора", http.StatusNotFound)
			return
		}
		if !o.Open {
			http.Error(w, "Голосование закрыто", http.StatusConflict)
			return
		}
		valid := map[int64]bool{}
		for _, it := range o.Items {
			valid[it.ID] = true
		}
		seen := map[int64]bool{}
		for _, x := range body.Order {
			if !valid[x] || seen[x] {
				http.Error(w, "Каждый персонаж — ровно один раз", http.StatusBadRequest)
				return
			}
			seen[x] = true
		}
		if len(body.Order) != len(o.Items) {
			http.Error(w, "Расставьте всех", http.StatusBadRequest)
			return
		}
		if _, err := pool.Exec(r.Context(), `
			INSERT INTO obzor_votes (user_id, obzor_id, item_ids) VALUES ($1, $2, $3)
			ON CONFLICT (user_id, obzor_id) DO UPDATE SET item_ids = EXCLUDED.item_ids, created_at = now()`,
			uid, id, body.Order); err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		o, _ = obzorLoad(r.Context(), pool, id, uid)
		writeJSON(w, http.StatusOK, o)
	}
}

// GET /api/obzor/{id}/comments: published comments, newest first
func obzorComments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		type comment struct {
			Author string `json:"author"`
			Text   string `json:"text"`
		}
		out := []comment{}
		rows, err := pool.Query(r.Context(), `
			SELECT u.display_name, c.text FROM obzor_comments c JOIN users u ON u.id = c.user_id
			WHERE c.obzor_id = $1 AND c.status = 'published' ORDER BY c.created_at DESC LIMIT 200`, obzorID(r))
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var c comment
			if rows.Scan(&c.Author, &c.Text) == nil {
				out = append(out, c)
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// POST /api/obzor/{id}/comments {"text": "…"}: only for archived reviews; goes to the bot for moderation
func addObzorComment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		var body struct {
			Text string `json:"text"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			http.Error(w, "Некорректный запрос", http.StatusBadRequest)
			return
		}
		text := strings.TrimSpace(body.Text)
		if n := utf8.RuneCountInString(text); n < 3 || n > 300 {
			http.Error(w, "От 3 до 300 знаков", http.StatusBadRequest)
			return
		}
		id := obzorID(r)
		var cid int64
		var question, author string
		err := pool.QueryRow(r.Context(), `
			INSERT INTO obzor_comments (obzor_id, user_id, text)
			SELECT id, $2, $3 FROM obzors WHERE id = $1 AND closes_at <= now()
			RETURNING id, (SELECT question FROM obzors WHERE id = $1), (SELECT display_name FROM users WHERE id = $2)`,
			id, uid, text).Scan(&cid, &question, &author)
		if err != nil {
			http.Error(w, "Комментарии открываются в архиве", http.StatusConflict)
			return
		}
		token := os.Getenv("TELEGRAM_BOT_TOKEN")
		owner, _ := strconv.ParseInt(os.Getenv("TELEGRAM_CHAT_ID"), 10, 64)
		if token != "" && owner != 0 {
			tgSay(r.Context(), token, owner,
				fmt.Sprintf("Комментарий к обзору «%s»\n%s:\n%s", question, author, text),
				map[string]any{"inline_keyboard": [][]map[string]string{{
					{"text": "Опубликовать", "callback_data": fmt.Sprintf("oc:%d:publish", cid)},
					{"text": "Отклонить", "callback_data": fmt.Sprintf("oc:%d:reject", cid)},
				}}})
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// the bot's buttons for a comment: publish or reject, once
func moderateObzorComment(ctx context.Context, pool *pgxpool.Pool, id int64, action string,
	answer func(string), edit func(string, map[string]any)) {
	status, label := "", ""
	switch action {
	case "publish":
		status, label = "published", "Опубликовано"
	case "reject":
		status, label = "rejected", "Отклонено"
	default:
		answer("?")
		return
	}
	tag, err := pool.Exec(ctx, `UPDATE obzor_comments SET status = $1 WHERE id = $2 AND status = 'pending'`, status, id)
	if err != nil || tag.RowsAffected() == 0 {
		answer("Уже решено")
		return
	}
	answer(label)
	edit(label, map[string]any{"inline_keyboard": [][]map[string]string{}})
}
