package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type tgUpdate struct {
	UpdateID      int64       `json:"update_id"`
	CallbackQuery *tgCallback `json:"callback_query"`
}

type tgCallback struct {
	ID      string                        `json:"id"`
	From    struct{ ID int64 `json:"id"` } `json:"from"`
	Data    string                        `json:"data"` // "st:42:packing" for orders, "rv:7:publish" for reviews
	Message *tgMessage                    `json:"message"`
}

type tgMessage struct {
	MessageID int64                         `json:"message_id"`
	Chat      struct{ ID int64 `json:"id"` } `json:"chat"`
	Text      string                        `json:"text"`
}

// how a status reads in the message log
var statusLabels = map[string]string{
	"packing": "Собираю", "on_the_way": "В пути", "delivered": "Доставлен", "cancelled": "Отменён",
}

// what the buttons say: actions, not states
var buttonLabels = map[string]string{
	"packing": "Собираю", "on_the_way": "В пути", "delivered": "Доставлен", "cancelled": "Отменить",
}

var reviewLabels = map[string]string{
	"publish": "Опубликовано", "spoiler": "Опубликовано как спойлер", "reject": "Отклонено",
}

var transitions = map[string][]string{
	"packing":    {"awaiting_quote", "awaiting_payment", "paid"},
	"on_the_way": {"packing"},
	"delivered":  {"on_the_way"},
	"cancelled":  {"awaiting_quote", "awaiting_payment", "paid", "packing", "on_the_way"},
}

var errStatusMoved = errors.New("статус уже изменился")

func keyboard(orderID int64, status string) map[string]any {
	var buttons []map[string]string
	for _, target := range []string{"packing", "on_the_way", "delivered", "cancelled"} {
		if slices.Contains(transitions[target], status) {
			buttons = append(buttons, map[string]string{
				"text":          buttonLabels[target],
				"callback_data": fmt.Sprintf("st:%d:%s", orderID, target),
			})
		}
	}
	rows := [][]map[string]string{}
	for i := 0; i < len(buttons); i += 2 {
		rows = append(rows, buttons[i:min(i+2, len(buttons))])
	}
	return map[string]any{"inline_keyboard": rows}
}

func tgCall(ctx context.Context, token, method string, payload, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.telegram.org/bot"+token+"/"+method, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("telegram %s: request failed", method) // the URL holds the token: never log it
	}
	defer resp.Body.Close()
	var env struct {
		OK          bool            `json:"ok"`
		Description string          `json:"description"`
		Result      json.RawMessage `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return err
	}
	if !env.OK {
		return fmt.Errorf("telegram %s: %s", method, env.Description)
	}
	if out != nil {
		return json.Unmarshal(env.Result, out)
	}
	return nil
}

func runBot(pool *pgxpool.Pool) {
	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	owner, err := strconv.ParseInt(os.Getenv("TELEGRAM_CHAT_ID"), 10, 64)
	if token == "" || err != nil {
		log.Println("bot: not configured, buttons disabled")
		return
	}
	var offset int64
	for {
		var updates []tgUpdate
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		err := tgCall(ctx, token, "getUpdates", map[string]any{
			"offset": offset, "timeout": 50, "allowed_updates": []string{"callback_query"},
		}, &updates)
		cancel()
		if err != nil {
			log.Printf("bot: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		for _, u := range updates {
			offset = u.UpdateID + 1
			if u.CallbackQuery != nil {
				handleCallback(pool, token, owner, u.CallbackQuery)
			}
		}
	}
}

func handleCallback(pool *pgxpool.Pool, token string, owner int64, cq *tgCallback) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	answer := func(text string) {
		tgCall(ctx, token, "answerCallbackQuery", map[string]any{"callback_query_id": cq.ID, "text": text}, nil)
	}
	// rewrite the message: add a status line, swap (or remove) the buttons
	edit := func(line string, markup map[string]any) {
		if m := cq.Message; m != nil {
			text := m.Text + "\n→ " + line + " " + time.Now().In(moscow).Format("15:04")
			if err := tgCall(ctx, token, "editMessageText", map[string]any{
				"chat_id": m.Chat.ID, "message_id": m.MessageID, "text": text, "reply_markup": markup,
			}, nil); err != nil {
				log.Printf("bot: edit message: %v", err)
			}
		}
	}

	if cq.From.ID != owner {
		answer("Нет доступа")
		return
	}
	parts := strings.Split(cq.Data, ":") // "st:42:packing" → ["st", "42", "packing"]
	if len(parts) != 3 {
		answer("?")
		return
	}
	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		answer("?")
		return
	}

	switch parts[0] {
	case "st": // order status
		target := parts[2]
		from, ok := transitions[target]
		if !ok {
			answer("?")
			return
		}
		if err := setStatus(ctx, pool, id, target, from); err != nil {
			if errors.Is(err, errStatusMoved) {
				answer("Статус уже изменился")
			} else {
				log.Printf("bot: order %d → %s: %v", id, target, err)
				answer("Ошибка, см. логи")
			}
			return
		}
		answer(statusLabels[target])
		edit(statusLabels[target], keyboard(id, target))

	case "rv", "sr": // review moderation: books and service
		action := parts[2]
		if err := moderateAny(ctx, pool, parts[0], id, action); err != nil {
			if errors.Is(err, errStatusMoved) {
				answer("Уже решено")
			} else {
				log.Printf("bot: review %d %s: %v", id, action, err)
				answer("Ошибка, см. логи")
			}
			return
		}
		answer(reviewLabels[action])
		edit(reviewLabels[action], map[string]any{"inline_keyboard": [][]map[string]string{}}) // decided: no more buttons

	default:
		answer("?")
	}
}

func setStatus(ctx context.Context, pool *pgxpool.Pool, id int64, target string, from []string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`UPDATE orders SET status = $1::order_status WHERE id = $2 AND status::text = ANY($3)`,
		target, id, from)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errStatusMoved
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO order_events (order_id, status) VALUES ($1, $2::order_status)`, id, target); err != nil {
		return err
	}
	if target == "cancelled" {
		if _, err := tx.Exec(ctx, `
			UPDATE products p SET stock = p.stock + i.quantity
			FROM order_items i
			WHERE i.order_id = $1 AND p.id = i.product_id`, id); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
