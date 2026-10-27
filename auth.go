package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const sessionCookie = "kiv_session"
const sessionLifetime = 30 * 24 * time.Hour

// a handler that only runs for logged-in users, and receives their id
type userHandler func(w http.ResponseWriter, r *http.Request, uid int64)

// verifyTelegram checks the login data really comes from Telegram (their documented method):
// sort every field except "hash" as key=value lines, sign them with HMAC-SHA256 using
// SHA256(bot token) as the key, and compare with the hash Telegram sent.
func verifyTelegram(q url.Values, botToken string) bool {
	hash := q.Get("hash")
	if hash == "" || botToken == "" {
		return false
	}
	var pairs []string
	for k := range q {
		if k != "hash" {
			pairs = append(pairs, k+"="+q.Get(k))
		}
	}
	sort.Strings(pairs)
	secret := sha256.Sum256([]byte(botToken))
	mac := hmac.New(sha256.New, secret[:])
	mac.Write([]byte(strings.Join(pairs, "\n")))
	expected := hex.EncodeToString(mac.Sum(nil))
	// hmac.Equal compares in constant time, so timing reveals nothing
	if !hmac.Equal([]byte(expected), []byte(hash)) {
		return false
	}
	// reject old login data, so a captured link can't be replayed later
	authDate, err := strconv.ParseInt(q.Get("auth_date"), 10, 64)
	return err == nil && time.Since(time.Unix(authDate, 0)) < 24*time.Hour
}

func randomToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// only this hash goes into the database; the token itself lives only in the cookie
func hashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

// userID returns the logged-in user's id, or 0 for a guest
func userID(ctx context.Context, pool *pgxpool.Pool, r *http.Request) int64 {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return 0
	}
	var uid int64
	if err := pool.QueryRow(ctx,
		`SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()`,
		hashToken(c.Value)).Scan(&uid); err != nil {
		return 0
	}
	return uid
}

func requireUser(pool *pgxpool.Pool, next userHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid := userID(r.Context(), pool, r)
		if uid == 0 {
			http.Error(w, "not logged in", http.StatusUnauthorized)
			return
		}
		next(w, r, uid)
	}
}

// telegramAuth: GET /api/auth/telegram?id=...&hash=...
// Telegram sends the user here after they confirm; we check, log them in, send them to /account
func telegramAuth(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if !verifyTelegram(q, os.Getenv("TELEGRAM_BOT_TOKEN")) {
			http.Error(w, "login check failed", http.StatusUnauthorized)
			return
		}
		ctx := r.Context()
		tgID, err := strconv.ParseInt(q.Get("id"), 10, 64)
		if err != nil {
			http.Error(w, "bad id", http.StatusBadRequest)
			return
		}
		name := strings.TrimSpace(q.Get("first_name") + " " + q.Get("last_name"))
		if name == "" {
			name = q.Get("username")
		}

		// first login creates the user; later logins refresh username and photo,
		// but keep the display name (people may want to change it on the site)
		var uid int64
		err = pool.QueryRow(ctx, `
			INSERT INTO users (telegram_id, display_name, username, photo_url)
			VALUES ($1, $2, nullif($3, ''), nullif($4, ''))
			ON CONFLICT (telegram_id) DO UPDATE
				SET username = EXCLUDED.username, photo_url = EXCLUDED.photo_url
			RETURNING id`, tgID, name, q.Get("username"), q.Get("photo_url")).Scan(&uid)
		if err != nil {
			log.Printf("auth: %v", err)
			http.Error(w, "login failed", http.StatusInternalServerError)
			return
		}

		token := randomToken()
		expires := time.Now().Add(sessionLifetime)
		if _, err := pool.Exec(ctx,
			`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
			hashToken(token), uid, expires); err != nil {
			log.Printf("auth: %v", err)
			http.Error(w, "login failed", http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name: sessionCookie, Value: token, Path: "/", Expires: expires,
			HttpOnly: true,                 // page JavaScript can't read it, so scripts can't steal it
			Secure:   true,                 // only ever sent over HTTPS
			SameSite: http.SameSiteLaxMode, // not sent along on requests started by other sites
		})
		http.Redirect(w, r, "/account", http.StatusFound)
	}
}

// logout: POST /api/logout
func logout(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(sessionCookie); err == nil {
			pool.Exec(r.Context(), `DELETE FROM sessions WHERE token_hash = $1`, hashToken(c.Value))
		}
		// MaxAge -1 tells the browser to delete the cookie
		http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1,
			HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode})
		w.WriteHeader(http.StatusNoContent)
	}
}

type ReadBook struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`
	Author    *string `json:"author"`
	Source    string  `json:"source"`
	Confirmed bool    `json:"confirmed"`
}

type OrderSummary struct {
	ID         int64     `json:"id"`
	Status     string    `json:"status"`
	TotalCents int       `json:"total_cents"`
	CreatedAt  time.Time `json:"created_at"`
	DeliverBy  time.Time `json:"deliver_by"`
}

type Me struct {
	ID        int64          `json:"id"`
	Name      string         `json:"name"`
	Username  *string        `json:"username"`
	Photo     *string        `json:"photo"`
	About     string         `json:"about"`
	Favorites []int64        `json:"favorites"`
	Blocked   []int64        `json:"blocked"`
	Reads     []ReadBook     `json:"reads"`
	Orders    []OrderSummary `json:"orders"`
}

// idList runs a query returning one number per row; never returns nil
func idList(ctx context.Context, pool *pgxpool.Pool, sql string, args ...any) ([]int64, error) {
	rows, err := pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if ids == nil {
		ids = []int64{}
	}
	return ids, err
}

// getMe: GET /api/me, everything the account page shows
func getMe(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		ctx := r.Context()
		fail := func(err error) {
			log.Printf("me: %v", err)
			http.Error(w, "query failed", http.StatusInternalServerError)
		}

		var me Me
		if err := pool.QueryRow(ctx,
			`SELECT id, display_name, username, photo_url, about FROM users WHERE id = $1`, uid,
		).Scan(&me.ID, &me.Name, &me.Username, &me.Photo, &me.About); err != nil {
			fail(err)
			return
		}
		var err error
		if me.Favorites, err = idList(ctx, pool,
			`SELECT tag_id FROM user_tags WHERE user_id = $1 AND kind = 'favorite'`, uid); err != nil {
			fail(err)
			return
		}
		if me.Blocked, err = idList(ctx, pool,
			`SELECT tag_id FROM user_tags WHERE user_id = $1 AND kind = 'blocked'`, uid); err != nil {
			fail(err)
			return
		}

		rows, err := pool.Query(ctx, `
			SELECT p.id, p.name, p.author, r.source, r.confirmed
			FROM book_reads r JOIN products p ON p.id = r.product_id
			WHERE r.user_id = $1 ORDER BY r.created_at DESC`, uid)
		if err == nil {
			me.Reads, err = pgx.CollectRows(rows, pgx.RowToStructByPos[ReadBook])
		}
		if err != nil {
			fail(err)
			return
		}

		rows, err = pool.Query(ctx, `
			SELECT id, status::text, total_cents, created_at, deliver_by
			FROM orders WHERE user_id = $1 ORDER BY id DESC LIMIT 50`, uid)
		if err == nil {
			me.Orders, err = pgx.CollectRows(rows, pgx.RowToStructByPos[OrderSummary])
		}
		if err != nil {
			fail(err)
			return
		}

		if me.Reads == nil {
			me.Reads = []ReadBook{}
		}
		if me.Orders == nil {
			me.Orders = []OrderSummary{}
		}
		writeJSON(w, http.StatusOK, me)
	}
}

// updateMe: PUT /api/me with {about, favorites, blocked}
func updateMe(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		var body struct {
			About     string  `json:"about"`
			Favorites []int64 `json:"favorites"`
			Blocked   []int64 `json:"blocked"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if len([]rune(body.About)) > 200 {
			http.Error(w, "about: 200 characters max", http.StatusBadRequest)
			return
		}
		ctx := r.Context()
		tx, err := pool.Begin(ctx)
		if err != nil {
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback(ctx)

		if _, err := tx.Exec(ctx, `UPDATE users SET about = $1 WHERE id = $2`, body.About, uid); err != nil {
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		// replace the whole taste profile with what the page sent
		if _, err := tx.Exec(ctx, `DELETE FROM user_tags WHERE user_id = $1`, uid); err != nil {
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		// favourites first, then blocked: a tag sent in both lists ends up blocked.
		// SELECT ... FROM tags WHERE id = $2 silently skips ids that don't exist.
		for _, list := range []struct {
			ids  []int64
			kind string
		}{{body.Favorites, "favorite"}, {body.Blocked, "blocked"}} {
			for _, id := range list.ids {
				if _, err := tx.Exec(ctx, `
					INSERT INTO user_tags (user_id, tag_id, kind)
					SELECT $1, id, $3 FROM tags WHERE id = $2
					ON CONFLICT (user_id, tag_id) DO UPDATE SET kind = EXCLUDED.kind`,
					uid, id, list.kind); err != nil {
					http.Error(w, "save failed", http.StatusInternalServerError)
					return
				}
			}
		}
		if err := tx.Commit(ctx); err != nil {
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// addRead: POST /api/me/reads with {product_id}; only books can be "read"
func addRead(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		var body struct {
			ProductID int64 `json:"product_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if _, err := pool.Exec(r.Context(), `
			INSERT INTO book_reads (user_id, product_id, source)
			SELECT $1, id, 'self' FROM products WHERE id = $2 AND category = 'book'
			ON CONFLICT DO NOTHING`, uid, body.ProductID); err != nil {
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// deleteRead: DELETE /api/me/reads/{id}
func deleteRead(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil {
			http.Error(w, "bad id", http.StatusBadRequest)
			return
		}
		pool.Exec(r.Context(), `DELETE FROM book_reads WHERE user_id = $1 AND product_id = $2`, uid, id)
		w.WriteHeader(http.StatusNoContent)
	}
}

// userExcludedBooks: everything the sommelier must never offer this person:
// books they marked read, books they bought, and books carrying a tag they blocked
func userExcludedBooks(ctx context.Context, pool *pgxpool.Pool, uid int64) ([]int64, error) {
	return idList(ctx, pool, `
		SELECT product_id FROM book_reads WHERE user_id = $1
		UNION
		SELECT i.product_id FROM order_items i JOIN orders o ON o.id = i.order_id
		WHERE o.user_id = $1 AND o.status <> 'cancelled'
		UNION
		SELECT bt.product_id FROM book_tags bt JOIN user_tags ut ON ut.tag_id = bt.tag_id
		WHERE ut.user_id = $1 AND ut.kind = 'blocked'`, uid)
}
