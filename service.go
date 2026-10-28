package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// the five grape stages, index 1..5
var grapeStage = []string{"", "Лист", "Цветение", "Завязь", "Созревание", "Гроздь"}

type ServiceReview struct {
	ID     int64     `json:"id"`
	Author string    `json:"author"`
	Grapes int       `json:"grapes"`
	Text   string    `json:"text"`
	At     time.Time `json:"at"`
}

// listServiceReviews: GET /api/service-reviews
func listServiceReviews(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		listJSON[ServiceReview](pool, w, r, `
			SELECT s.id, u.display_name, s.grapes::int, s.text, s.published_at
			FROM service_reviews s JOIN users u ON u.id = s.user_id
			WHERE s.status = 'published'
			ORDER BY s.published_at DESC LIMIT 50`)
	}
}

type OrderRef struct {
	ID        int64     `json:"id"`
	CreatedAt time.Time `json:"created_at"`
}

// reviewableOrders: GET /api/me/reviewable-orders, this user's delivered orders without a review yet
func reviewableOrders(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		listJSON[OrderRef](pool, w, r, `
			SELECT o.id, o.created_at FROM orders o
			WHERE o.user_id = $1 AND o.status = 'delivered'
			  AND NOT EXISTS (SELECT 1 FROM service_reviews s WHERE s.order_id = o.id)
			ORDER BY o.id DESC`, uid)
	}
}

// createServiceReview: POST /api/service-reviews with {order_id, grapes, text}
func createServiceReview(pool *pgxpool.Pool) userHandler {
	return func(w http.ResponseWriter, r *http.Request, uid int64) {
		var body struct {
			OrderID int64  `json:"order_id"`
			Grapes  int    `json:"grapes"`
			Text    string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Некорректный запрос", http.StatusBadRequest)
			return
		}
		text := strings.TrimSpace(body.Text)
		if body.Grapes < 1 || body.Grapes > 5 {
			http.Error(w, "Оценка от 1 до 5", http.StatusBadRequest)
			return
		}
		if n := utf8.RuneCountInString(text); n < 10 || n > 300 {
			http.Error(w, "От 10 до 300 символов", http.StatusBadRequest)
			return
		}

		// the SELECT only yields a row for this user's own delivered order;
		// ON CONFLICT catches a second review of the same order
		var id int64
		err := pool.QueryRow(r.Context(), `
			INSERT INTO service_reviews (user_id, order_id, grapes, text)
			SELECT $1, id, $3, $4 FROM orders WHERE id = $2 AND user_id = $1 AND status = 'delivered'
			ON CONFLICT (order_id) DO NOTHING
			RETURNING id`, uid, body.OrderID, body.Grapes, text).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Отзыв можно оставить только о своём доставленном заказе, и один раз", http.StatusBadRequest)
			return
		}
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		go notifyServiceReview(pool, id)
		writeJSON(w, http.StatusCreated, map[string]string{"status": "pending"})
	}
}

func notifyServiceReview(pool *pgxpool.Pool, id int64) {
	token, chatID := os.Getenv("TELEGRAM_BOT_TOKEN"), os.Getenv("TELEGRAM_CHAT_ID")
	if token == "" || chatID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var who, text string
	var orderID int64
	var grapes int
	if err := pool.QueryRow(ctx, `
		SELECT u.display_name, s.order_id, s.grapes::int, s.text
		FROM service_reviews s JOIN users u ON u.id = s.user_id
		WHERE s.id = $1`, id).Scan(&who, &orderID, &grapes, &text); err != nil {
		log.Printf("notify service review %d: %v", id, err)
		return
	}
	msg := fmt.Sprintf("Отзыв о доставке #%d\nЗаказ №%d\nОт: %s\nОценка: %s\n\n«%s»",
		id, orderID, who, grapeStage[grapes], text)
	kb := map[string]any{"inline_keyboard": [][]map[string]string{{
		{"text": "Опубликовать", "callback_data": fmt.Sprintf("sr:%d:publish", id)},
		{"text": "Отклонить", "callback_data": fmt.Sprintf("sr:%d:reject", id)},
	}}}
	if err := tgCall(ctx, token, "sendMessage",
		map[string]any{"chat_id": chatID, "text": msg, "reply_markup": kb}, nil); err != nil {
		log.Printf("notify service review %d: %v", id, err)
	}
}

func moderateServiceReview(ctx context.Context, pool *pgxpool.Pool, id int64, action string) error {
	var sql string
	switch action {
	case "publish":
		sql = `UPDATE service_reviews SET status = 'published', published_at = now() WHERE id = $1 AND status = 'pending'`
	case "reject":
		sql = `UPDATE service_reviews SET status = 'rejected' WHERE id = $1 AND status = 'pending'`
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

// moderateAny routes a Telegram decision to the right kind of review:
// "rv" = book review, "sr" = service review
func moderateAny(ctx context.Context, pool *pgxpool.Pool, kind string, id int64, action string) error {
	if kind == "sr" {
		return moderateServiceReview(ctx, pool, id, action)
	}
	return moderateReview(ctx, pool, id, action)
}
