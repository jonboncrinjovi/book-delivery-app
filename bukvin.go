package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const bkAttempts = 6

var bkAttemptFactor = []float64{1, 0.85, 0.7, 0.55, 0.4, 0.25}

func bkNorm(s string) string { return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(s)), "ё", "е") }

func bkLetters(s string) bool {
	for _, r := range s {
		if r < 'а' || r > 'я' {
			return false
		}
	}
	return s != ""
}

// g = right letter, right place; y = in the word, elsewhere; b = not in the word.
// Greens first, then yellows from the letters left over, so repeated letters colour correctly.
func bkMarks(guess, answer string) string {
	g, a := []rune(guess), []rune(answer)
	marks := make([]byte, len(g))
	left := map[rune]int{}
	for i := range g {
		if g[i] == a[i] {
			marks[i] = 'g'
		} else {
			marks[i] = 'b'
			left[a[i]]++
		}
	}
	for i := range g {
		if marks[i] == 'b' && left[g[i]] > 0 {
			marks[i] = 'y'
			left[g[i]]--
		}
	}
	return string(marks)
}

// 1.0 at the start, falling to 0.4 at ten minutes, then staying there
func bkTime(elapsed time.Duration) float64 {
	return 1 - 0.06*math.Max(0, math.Min(elapsed.Minutes(), 10))
}

type bkRow struct {
	Word  string `json:"word"`
	Marks string `json:"marks"`
}

type bkState struct {
	Length       int     `json:"length"`
	Base         int     `json:"base"`
	State        string  `json:"state"` // none, new, playing, done
	Rows         []bkRow `json:"rows"`
	AttemptsLeft int     `json:"attempts_left"`
	Score        int     `json:"score"`
	Solved       bool    `json:"solved"`
	Answer       string  `json:"answer,omitempty"`
	Book         *vtBook `json:"book,omitempty"`
}

func bkView(ctx context.Context, pool *pgxpool.Pool, uid int64) (bkState, error) {
	s := bkState{Rows: []bkRow{}, AttemptsLeft: bkAttempts}
	var word string
	var productID *int64
	err := pool.QueryRow(ctx, `SELECT word, base, product_id FROM bukvin_days WHERE play_date = $1`, moscowToday()).
		Scan(&word, &s.Base, &productID)
	if errors.Is(err, pgx.ErrNoRows) {
		s.State = "none"
		return s, nil
	}
	if err != nil {
		return s, err
	}
	s.Length = utf8.RuneCountInString(word)
	var guesses []string
	var finished *time.Time
	err = pool.QueryRow(ctx, `SELECT guesses, finished_at, solved, score FROM bukvin_plays WHERE user_id = $1 AND play_date = $2`,
		uid, moscowToday()).Scan(&guesses, &finished, &s.Solved, &s.Score)
	if errors.Is(err, pgx.ErrNoRows) {
		s.State = "new"
		return s, nil
	}
	if err != nil {
		return s, err
	}
	for _, g := range guesses {
		s.Rows = append(s.Rows, bkRow{Word: g, Marks: bkMarks(g, word)})
	}
	s.AttemptsLeft = bkAttempts - len(guesses)
	if finished == nil {
		s.State = "playing"
		return s, nil
	}
	s.State, s.Answer = "done", word
	if productID != nil {
		var b vtBook
		var cover *string
		if pool.QueryRow(ctx, `SELECT id, name, cover_path FROM products WHERE id = $1`, *productID).Scan(&b.ID, &b.Name, &cover) == nil {
			b.Cover = mediaURL(cover)
			s.Book = &b
		}
	}
	return s, nil
}

func bkWrite(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool, uid int64) {
	s, err := bkView(r.Context(), pool, uid)
	if err != nil {
		http.Error(w, "Ошибка", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, s)
}

// GET /api/bukvin/today
func bkToday(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if uid, ok := vtUser(w, r, pool); ok {
			bkWrite(w, r, pool, uid)
		}
	}
}

// POST /api/bukvin/start: the clock starts
func bkStart(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		pool.Exec(r.Context(), `
			INSERT INTO bukvin_plays (user_id, play_date)
			SELECT $1, play_date FROM bukvin_days WHERE play_date = $2
			ON CONFLICT DO NOTHING`, uid, moscowToday())
		bkWrite(w, r, pool, uid)
	}
}

// POST /api/bukvin/guess {"word": "…"}: a non-word or wrong length is refused without costing an attempt
func bkGuess(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		var body struct {
			Word string `json:"word"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			http.Error(w, "Некорректный запрос", http.StatusBadRequest)
			return
		}
		guess := bkNorm(body.Word)
		ctx := r.Context()
		tx, err := pool.Begin(ctx)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback(ctx)

		var answer string
		var base int
		var started time.Time
		var guesses []string
		var finished *time.Time
		err = tx.QueryRow(ctx, `
			SELECT d.word, d.base, p.started_at, p.guesses, p.finished_at
			FROM bukvin_plays p JOIN bukvin_days d ON d.play_date = p.play_date
			WHERE p.user_id = $1 AND p.play_date = $2 FOR UPDATE OF p`, uid, moscowToday()).
			Scan(&answer, &base, &started, &guesses, &finished)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Сначала начните игру", http.StatusBadRequest)
			return
		}
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		if finished == nil && len(guesses) < bkAttempts {
			n := utf8.RuneCountInString(answer)
			switch {
			case utf8.RuneCountInString(guess) != n:
				http.Error(w, fmt.Sprintf("Нужно слово из %d букв", n), http.StatusBadRequest)
				return
			case !bkLetters(guess):
				http.Error(w, "Только русские буквы", http.StatusBadRequest)
				return
			case guess != answer:
				var known bool
				tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM bukvin_words WHERE word = $1)`, guess).Scan(&known)
				if !known {
					http.Error(w, "Такого слова нет даже у Хлебникова.", http.StatusBadRequest)
					return
				}
			}
			attempt := len(guesses) // 0-based index of this attempt
			switch {
			case guess == answer:
				score := max(1, int(math.Round(float64(base)*bkTime(time.Since(started))*bkAttemptFactor[attempt])))
				tx.Exec(ctx, `UPDATE bukvin_plays SET guesses = array_append(guesses, $3), finished_at = now(), solved = true, score = $4
					WHERE user_id = $1 AND play_date = $2`, uid, moscowToday(), guess, score)
			case attempt+1 >= bkAttempts:
				tx.Exec(ctx, `UPDATE bukvin_plays SET guesses = array_append(guesses, $3), finished_at = now()
					WHERE user_id = $1 AND play_date = $2`, uid, moscowToday(), guess)
			default:
				tx.Exec(ctx, `UPDATE bukvin_plays SET guesses = array_append(guesses, $3)
					WHERE user_id = $1 AND play_date = $2`, uid, moscowToday(), guess)
			}
		}
		if err := tx.Commit(ctx); err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		bkWrite(w, r, pool, uid)
	}
}
