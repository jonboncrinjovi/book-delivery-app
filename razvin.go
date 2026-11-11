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

const razvinTiles = 48

// the prizes and how many of each lie on the 48-tile field (keep in step with «Правила игр»)
var razvinPrizes = []struct {
Code, Name    string
Points, Count int
}{
{"leaf", "Лист", 10, 31},
{"set", "Завязь", 30, 8},
{"ripening", "Созревание", 75, 6},
{"cluster", "Гроздь", 200, 2},
{"gold", "Золотая лоза", 1000, 1},
}

// the whole field: every prize in its set number, shuffled with cryptographic randomness (Fisher–Yates)
func razvinShuffled() []string {
board := make([]string, 0, razvinTiles)
for _, p := range razvinPrizes {
for i := 0; i < p.Count; i++ {
board = append(board, p.Code)
}
}
for i := len(board) - 1; i > 0; i-- {
n, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
if err != nil {
continue
}
j := int(n.Int64())
board[i], board[j] = board[j], board[i]
}
return board
}

func razvinName(code string) string {
	for _, p := range razvinPrizes {
		if p.Code == code {
			return p.Name
		}
	}
	return code
}

func razvinPoints(code string) int {
	for _, p := range razvinPrizes {
		if p.Code == code {
			return p.Points
		}
	}
	return razvinPrizes[0].Points
}

// today's field for this player: shuffled and saved on first sight.
// ON CONFLICT DO NOTHING: once a field exists, a reload cannot draw another one
func razvinBoard(r *http.Request, pool *pgxpool.Pool, uid int64) ([]string, error) {
	day := moscowToday()
	fresh := razvinShuffled()
	if _, err := pool.Exec(r.Context(), `
        INSERT INTO razvin_boards (user_id, play_date, board)
        VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, uid, day, fresh); err != nil {
		return nil, err
	}
	var board []string
	err := pool.QueryRow(r.Context(), `SELECT board FROM razvin_boards WHERE user_id = $1 AND play_date = $2`,
		uid, day).Scan(&board)
	if err != nil {
		return nil, err
	}
	if len(board) != razvinTiles {
		return nil, errors.New("razvin: bad board")
	}
	return board, nil
}

type razvinResult struct {
	Played bool     `json:"played"`
	Tile   int      `json:"tile"`
	Prize  string   `json:"prize,omitempty"`
	Name   string   `json:"name,omitempty"`
	Score  int      `json:"score"`
	Board  []string `json:"board,omitempty"` // only after the tap
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
	// the field is shown only now; a tap made before fields existed keeps its own prize on its tile
	if board, err := razvinBoard(r, pool, uid); err == nil {
		board[res.Tile] = res.Prize
		res.Board = board
	}
	return res, nil
}

// GET /api/razvin/today: lays out today's field if there is none, and says whether the tap is used
func razvinToday(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		if _, err := razvinBoard(r, pool, uid); err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
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

// POST /api/razvin/tap {"tile": 0..47}: the day's one tap takes what lies under that tile; a second one just returns the first result
func razvinTap(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := vtUser(w, r, pool)
		if !ok {
			return
		}
		var body struct {
			Tile int `json:"tile"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || body.Tile < 0 || body.Tile >= razvinTiles {
			http.Error(w, "Некорректная плитка", http.StatusBadRequest)
			return
		}
		board, err := razvinBoard(r, pool, uid)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		code := board[body.Tile]
		// ON CONFLICT DO NOTHING: if today's tap already exists, the first one stands
		pool.Exec(r.Context(), `
            INSERT INTO razvin_plays (user_id, play_date, tile, prize, score)
            VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
			uid, moscowToday(), body.Tile, code, razvinPoints(code))
		res, err := razvinLoad(r, pool, uid)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, res)
	}
}
