package main

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	vtSeconds  = 60 // the round's clock
	vtGrace    = 3  // seconds forgiven for the network
	vtMaxGuess = 3
)

var guessFactor = []float64{1, 0.6, 0.3}

type vtAnswer struct {
	text   string
	weight float64
}

// "Иван Карамазов|Карамазов:0.5|Иван:0.4" → the accepted answers with their weights
func parseAnswers(raw string) []vtAnswer {
	var out []vtAnswer
	for _, part := range strings.Split(raw, "|") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		a := vtAnswer{text: part, weight: 1}
		if i := strings.LastIndex(part, ":"); i > 0 {
			if w, err := strconv.ParseFloat(part[i+1:], 64); err == nil {
				a = vtAnswer{text: strings.TrimSpace(part[:i]), weight: w}
			}
		}
		out = append(out, a)
	}
	return out
}

// lower case, ё → е, everything that isn't a letter or digit becomes one space
func normAnswer(s string) string {
	s = strings.ReplaceAll(strings.ToLower(s), "ё", "е")
	var b strings.Builder
	space := false
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			space = false
		} else if !space {
			b.WriteRune(' ')
			space = true
		}
	}
	return strings.TrimSpace(b.String())
}

// edits (insert, delete, replace) needed to turn a into b, counted in letters
func levenshtein(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	prev := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		cur := make([]int, len(rb)+1)
		cur[0] = i
		for j := 1; j <= len(rb); j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			cur[j] = min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost)
		}
		prev = cur
	}
	return prev[len(rb)]
}

func allowedTypos(letters int) int {
	switch {
	case letters <= 4:
		return 0
	case letters <= 8:
		return 1
	default:
		return 2
	}
}

// the best accuracy of a guess against the accepted answers; 0 = wrong
func accuracy(guess string, answers []vtAnswer) float64 {
	g := normAnswer(guess)
	if g == "" {
		return 0
	}
	best := 0.0
	for _, a := range answers {
		t := normAnswer(a.text)
		d := levenshtein(g, t)
		if d <= allowedTypos(utf8.RuneCountInString(t)) {
			best = max(best, a.weight*(1-0.15*float64(d)))
		}
	}
	return best
}

// 1.0 at the first second, falling evenly to 0.4 at the sixtieth
func timeFactor(elapsed time.Duration) float64 {
	s := math.Max(0, math.Min(elapsed.Seconds(), vtSeconds))
	return 1 - 0.6*s/vtSeconds
}

func moscowToday() string { return time.Now().In(moscow).Format("2006-01-02") }

type vtBook struct {
	ID    int64   `json:"id"`
	Name  string  `json:"name"`
	Cover *string `json:"cover"`
}

// what one player sees of one puzzle; nothing secret before it's their turn
type vtPuzzle struct {
	ID          int64   `json:"id"`
	Slot        int     `json:"slot"`
	Base        int     `json:"base"`
	State       string  `json:"state"` // new, playing, done
	Score       int     `json:"score"`
	Image       string  `json:"image,omitempty"`
	Line        string  `json:"line,omitempty"`
	Hint        string  `json:"hint,omitempty"`
	GuessesLeft int     `json:"guesses_left"`
	SecondsLeft int     `json:"seconds_left"`
	Answer      string  `json:"answer,omitempty"`
	Book        *vtBook `json:"book,omitempty"`
}

func vtView(ctx context.Context, pool *pgxpool.Pool, uid, id int64) (vtPuzzle, error) {
	var p vtPuzzle
	var image, line, hint, answers string
	var productID *int64
	if err := pool.QueryRow(ctx,
		`SELECT id, slot, base, image, line, hint, answers, product_id FROM puzzles WHERE id = $1`, id).
		Scan(&p.ID, &p.Slot, &p.Base, &image, &line, &hint, &answers, &productID); err != nil {
		return p, err
	}
	var started time.Time
	var finished *time.Time
	var hintUsed bool
	var guesses int
	err := pool.QueryRow(ctx, `
		SELECT started_at, finished_at, hint_used, guesses, score FROM puzzle_plays
		WHERE user_id = $1 AND puzzle_id = $2`, uid, id).Scan(&started, &finished, &hintUsed, &guesses, &p.Score)
	if errors.Is(err, pgx.ErrNoRows) {
		p.State, p.GuessesLeft, p.SecondsLeft = "new", vtMaxGuess, vtSeconds
		return p, nil
	}
	if err != nil {
		return p, err
	}
	// a round left hanging past its time closes itself with nothing
	if finished == nil && time.Since(started) > (vtSeconds+vtGrace)*time.Second {
		pool.Exec(ctx, `UPDATE puzzle_plays SET finished_at = now(), score = 0
			WHERE user_id = $1 AND puzzle_id = $2 AND finished_at IS NULL`, uid, id)
		now := time.Now()
		finished, p.Score = &now, 0
	}
	if u := mediaURL(&image); u != nil {
		p.Image = *u
	}
	p.Line = line
	if hintUsed {
		p.Hint = hint
	}
	if finished == nil {
		p.State = "playing"
		p.GuessesLeft = vtMaxGuess - guesses
		p.SecondsLeft = max(0, vtSeconds-int(time.Since(started).Seconds()))
		return p, nil
	}
	p.State, p.Hint = "done", hint
	if a := parseAnswers(answers); len(a) > 0 {
		p.Answer = a[0].text
	}
	if productID != nil {
		var b vtBook
		var cover *string
		if pool.QueryRow(ctx, `SELECT id, name, cover_path FROM products WHERE id = $1`, *productID).
			Scan(&b.ID, &b.Name, &cover) == nil {
			b.Cover = mediaURL(cover)
			p.Book = &b
		}
	}
	return p, nil
}

func vtUser(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool) (int64, bool) {
	uid := userID(r.Context(), pool, r)
	if uid == 0 {
		http.Error(w, "Войдите через Telegram, чтобы играть", http.StatusUnauthorized)
		return 0, false
	}
	return uid, true
}

func vtID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return 0, false
	}
	return id, true
}

// GET /api/vintorina/today: today's three puzzles, as this player sees them
func vtToday(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		rows, err := pool.Query(r.Context(), `SELECT id FROM puzzles WHERE play_date = $1 ORDER BY slot`, moscowToday())
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		var ids []int64
		for rows.Next() {
			var id int64
			if rows.Scan(&id) == nil {
				ids = append(ids, id)
			}
		}
		rows.Close()
		out := []vtPuzzle{}
		for _, id := range ids {
			if p, err := vtView(r.Context(), pool, uid, id); err == nil {
				out = append(out, p)
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// POST /api/vintorina/{id}/start: the clock starts, the picture and the line are sent
func vtStart(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		id, ok := vtID(w, r)
		if !ok {
			return
		}
		tag, err := pool.Exec(r.Context(), `
			INSERT INTO puzzle_plays (user_id, puzzle_id)
			SELECT $1, id FROM puzzles WHERE id = $2 AND play_date = $3
			ON CONFLICT DO NOTHING`, uid, id, moscowToday())
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		_ = tag // already started: the clock simply keeps running
		p, err := vtView(r.Context(), pool, uid, id)
		if err != nil || p.State == "new" {
			http.Error(w, "Эта загадка сегодня не играется", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, p)
	}
}

// POST /api/vintorina/{id}/hint: the hint, at half the score
func vtHint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		id, ok := vtID(w, r)
		if !ok {
			return
		}
		pool.Exec(r.Context(), `UPDATE puzzle_plays SET hint_used = true
			WHERE user_id = $1 AND puzzle_id = $2 AND finished_at IS NULL`, uid, id)
		p, err := vtView(r.Context(), pool, uid, id)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, p)
	}
}

// POST /api/vintorina/{id}/guess {"answer": "…"}: checked and scored on the server
func vtGuess(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		id, ok := vtID(w, r)
		if !ok {
			return
		}
		var body struct {
			Answer string `json:"answer"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || utf8.RuneCountInString(body.Answer) > 100 {
			http.Error(w, "Некорректный ответ", http.StatusBadRequest)
			return
		}
		ctx := r.Context()
		tx, err := pool.Begin(ctx)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback(ctx)

		var started time.Time
		var finished *time.Time
		var hintUsed bool
		var guesses, base int
		var answers string
		err = tx.QueryRow(ctx, `
			SELECT pp.started_at, pp.finished_at, pp.hint_used, pp.guesses, p.base, p.answers
			FROM puzzle_plays pp JOIN puzzles p ON p.id = pp.puzzle_id
			WHERE pp.user_id = $1 AND pp.puzzle_id = $2 FOR UPDATE OF pp`, uid, id).
			Scan(&started, &finished, &hintUsed, &guesses, &base, &answers)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Сначала начните раунд", http.StatusBadRequest)
			return
		}
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		correct := false
		elapsed := time.Since(started)
		switch {
		case finished != nil || guesses >= vtMaxGuess:
			// already over: nothing changes
		case elapsed > (vtSeconds+vtGrace)*time.Second:
			tx.Exec(ctx, `UPDATE puzzle_plays SET finished_at = now(), score = 0 WHERE user_id = $1 AND puzzle_id = $2`, uid, id)
		default:
			acc := accuracy(body.Answer, parseAnswers(answers))
			if acc > 0 {
				correct = true
				score := float64(base) * timeFactor(elapsed) * acc * guessFactor[guesses]
				if hintUsed {
					score *= 0.5
				}
				tx.Exec(ctx, `UPDATE puzzle_plays SET finished_at = now(), guesses = guesses + 1, score = $3
					WHERE user_id = $1 AND puzzle_id = $2`, uid, id, max(1, int(math.Round(score))))
			} else if guesses+1 >= vtMaxGuess {
				tx.Exec(ctx, `UPDATE puzzle_plays SET finished_at = now(), guesses = guesses + 1, score = 0
					WHERE user_id = $1 AND puzzle_id = $2`, uid, id)
			} else {
				tx.Exec(ctx, `UPDATE puzzle_plays SET guesses = guesses + 1 WHERE user_id = $1 AND puzzle_id = $2`, uid, id)
			}
		}
		if err := tx.Commit(ctx); err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		p, err := vtView(ctx, pool, uid, id)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, struct {
			vtPuzzle
			Correct bool `json:"correct"`
		}{p, correct})
	}
}

// GET /api/vintorina/top?period=day|month|all: the leaderboard, plus the player's own total
func vtTop(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		now := time.Now().In(moscow)
		since := time.Time{}
		switch r.URL.Query().Get("period") {
		case "day":
			since = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, moscow)
		case "month":
			since = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, moscow)
		}
		type row struct {
			Nickname string `json:"nickname"`
			Total    int    `json:"total"`
		}
		top := []row{}
		rows, err := pool.Query(r.Context(), `
			SELECT u.nickname, SUM(pp.score)::int AS total
			FROM puzzle_plays pp JOIN users u ON u.id = pp.user_id
			WHERE u.show_in_top AND u.nickname IS NOT NULL AND pp.finished_at >= $1
			GROUP BY u.id, u.nickname HAVING SUM(pp.score) > 0
			ORDER BY total DESC LIMIT 20`, since)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		for rows.Next() {
			var x row
			if rows.Scan(&x.Nickname, &x.Total) == nil {
				top = append(top, x)
			}
		}
		rows.Close()
		out := map[string]any{"top": top}
		if uid := userID(r.Context(), pool, r); uid != 0 {
			var me struct {
				Nickname *string `json:"nickname"`
				Show     bool    `json:"show_in_top"`
				Total    int     `json:"total"`
			}
			pool.QueryRow(r.Context(), `
				SELECT u.nickname, u.show_in_top,
				       coalesce((SELECT SUM(score) FROM puzzle_plays WHERE user_id = u.id AND finished_at >= $2), 0)::int
				FROM users u WHERE u.id = $1`, uid, since).Scan(&me.Nickname, &me.Show, &me.Total)
			out["me"] = me
		}
		writeJSON(w, http.StatusOK, out)
	}
}

var nicknameRe = regexp.MustCompile(`^[\p{L}\p{N}_ .-]{3,20}$`)

// PUT /api/vintorina/profile {"nickname": "…", "show_in_top": true}
func vtProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		var body struct {
			Nickname  string `json:"nickname"`
			ShowInTop bool   `json:"show_in_top"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			http.Error(w, "Некорректный запрос", http.StatusBadRequest)
			return
		}
		body.Nickname = strings.TrimSpace(body.Nickname)
		if !nicknameRe.MatchString(body.Nickname) {
			http.Error(w, "Ник: от 3 до 20 букв, цифр, пробелов, точек или подчёркиваний", http.StatusBadRequest)
			return
		}
		_, err := pool.Exec(r.Context(), `UPDATE users SET nickname = $1, show_in_top = $2 WHERE id = $3`,
			body.Nickname, body.ShowInTop, uid)
		if err != nil {
			if strings.Contains(err.Error(), "users_nickname_key") {
				http.Error(w, "Этот ник уже занят", http.StatusConflict)
				return
			}
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
