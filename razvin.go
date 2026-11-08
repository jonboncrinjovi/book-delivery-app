package main

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// the prizes and their weights out of 1000 (keep in step with «Правила игр»)
var razvinPrizes = []struct {
	Code, Name     string
	Points, Weight int
}{
	{"leaf", "Лист", 10, 700},
	{"blossom", "Цветение", 25, 180},
	{"set", "Завязь", 50, 80},
	{"ripening", "Созревание", 100, 30},
	{"cluster", "Гроздь", 250, 9},
	{"gold", "Золотая лоза", 1000, 1},
}

// a cryptographic random number from 0 to 999, walked through the weights
func razvinDraw() (code, name string, points int) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000))
	if err != nil {
		p := razvinPrizes[0]
		return p.Code, p.Name, p.Points
	}
	x := int(n.Int64())
	for _, p := range razvinPrizes {
		if x < p.Weight {
			return p.Code, p.Name, p.Points
		}
		x -= p.Weight
	}
	p := razvinPrizes[0]
	return p.Code, p.Name, p.Points
}

func razvinName(code string) string {
	for _, p := range razvinPrizes {
		if p.Code == code {
			return p.Name
		}
	}
	return code
}

type razvinResult struct {
	Played bool   `json:"played"`
	Tile   int    `json:"tile"`
	Prize  string `json:"prize,omitempty"`
	Name   string `json:"name,omitempty"`
	Score  int    `json:"score"`
}

func razvinLoad(r *http.Request, pool *pgxpool.Pool, uid int64) (razvinResult, error) {
	var res razvinResult
	err := pool.QueryRow(r.Context(), `SELECT tile, prize, score FROM razvin_plays WHERE user_id = $1 AND play_date = $2`,
		uid, moscowToday()).Scan(&res.Tile, &res.Prize, &res.Score)
	if errors.Is(err, pgx.ErrNoRows) {
		return razvinResult{}, nil
	}
	if err != nil {
		return res, err
	}
	res.Played, res.Name = true, razvinName(res.Prize)
	return res, nil
}

// GET /api/razvin/today: whether today's tap is used, and what it found
func razvinToday(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		res, err := razvinLoad(r, pool, uid)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, res)
	}
}

// POST /api/razvin/tap {"tile": 0..47}: the day's one tap; a second one just returns the first result
func razvinTap(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		var body struct {
			Tile int `json:"tile"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || body.Tile < 0 || body.Tile > 47 {
			http.Error(w, "Некорректная клетка", http.StatusBadRequest)
			return
		}
		code, _, points := razvinDraw()
		// ON CONFLICT DO NOTHING: if today's tap already exists, nothing is drawn again
		pool.Exec(r.Context(), `
			INSERT INTO razvin_plays (user_id, play_date, tile, prize, score)
			VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
			uid, moscowToday(), body.Tile, code, points)
		res, err := razvinLoad(r, pool, uid)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, res)
	}
}
