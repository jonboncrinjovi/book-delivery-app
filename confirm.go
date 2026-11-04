package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math/rand/v2"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// a message someone writes to the bot (only /start with an order token matters)
type tgIncoming struct {
	Chat struct {
		ID   int64  `json:"id"`
		Type string `json:"type"`
	} `json:"chat"`
	From struct {
		ID int64 `json:"id"`
	} `json:"from"`
	Text string `json:"text"`
}

// single words, easy to say at the door
var literaryWords = []string{
	"Онегин", "Печорин", "Обломов", "Чичиков", "Раскольников", "Мышкин", "Базаров", "Маргарита",
	"Воланд", "Азазелло", "Бегемот", "Коровьев", "Хлестаков", "Левша", "Каштанка", "Ассоль",
	"Дубровский", "Гринёв", "Плюшкин", "Собакевич", "Манилов", "Коробочка", "Ноздрёв", "Грушенька",
	"Сонечка", "Тарас", "Остап", "Шариков", "Гамлет", "Офелия", "Квазимодо", "Эсмеральда",
	"Робинзон", "Гулливер", "Алиса", "Мцыри", "Демон", "Лариса", "Катерина", "Аксинья",
	"Тёркин", "Тристан", "Изольда", "Дульсинея", "Ромео", "Джульетта", "Фауст", "Мефистофель",
}

func rubFmt(cents int) string { return fmt.Sprintf("%d ₽", cents/100) }

func tgSay(ctx context.Context, token string, chat int64, text string, markup map[string]any) {
	payload := map[string]any{"chat_id": chat, "text": text}
	if markup != nil {
		payload["reply_markup"] = markup
	}
	if err := tgCall(ctx, token, "sendMessage", payload, nil); err != nil {
		log.Printf("bot: send: %v", err)
	}
}

func confirmLines(ctx context.Context, pool *pgxpool.Pool, id int64) string {
	rows, err := pool.Query(ctx, `
		SELECT CASE WHEN i.hidden THEN 'Книга-сюрприз' ELSE p.name END, i.quantity
		FROM order_items i JOIN products p ON p.id = i.product_id
		WHERE i.order_id = $1 ORDER BY i.hidden DESC, p.name`, id)
	if err != nil {
		return ""
	}
	defer rows.Close()
	var b strings.Builder
	for rows.Next() {
		var name string
		var qty int
		if rows.Scan(&name, &qty) == nil {
			if qty > 1 {
				fmt.Fprintf(&b, "— %s × %d\n", name, qty)
			} else {
				fmt.Fprintf(&b, "— %s\n", name)
			}
		}
	}
	return b.String()
}

// "/start <track token>": show the order and the confirm button
func handleMessage(pool *pgxpool.Pool, token string, m *tgIncoming) {
	if m.Chat.Type != "private" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	text := strings.TrimSpace(m.Text)
	track := strings.TrimSpace(strings.TrimPrefix(text, "/start"))
	if !strings.HasPrefix(text, "/start") || track == "" {
		tgSay(ctx, token, m.Chat.ID, "Здравствуйте! Здесь подтверждают заказы literalwine.ru: откройте «Подтвердить в Telegram» на странице своего заказа.", nil)
		return
	}

	var id int64
	var status string
	var total int
	var deliverBy time.Time
	var confirmed bool
	var word *string
	err := pool.QueryRow(ctx, `
		SELECT id, status::text, total_cents, deliver_by, confirmed_at IS NOT NULL, confirm_word
		FROM orders WHERE track_token = $1`, track).Scan(&id, &status, &total, &deliverBy, &confirmed, &word)
	if errors.Is(err, pgx.ErrNoRows) {
		tgSay(ctx, token, m.Chat.ID, "Такого заказа мы не нашли.", nil)
		return
	}
	if err != nil {
		log.Printf("bot: confirm lookup: %v", err)
		tgSay(ctx, token, m.Chat.ID, "Что-то пошло не так, попробуйте ещё раз.", nil)
		return
	}
	if confirmed && word != nil {
		tgSay(ctx, token, m.Chat.ID, fmt.Sprintf("Заказ №%d уже подтверждён. Пароль для курьера: «%s».", id, *word), nil)
		return
	}
	if status == "cancelled" || status == "delivered" {
		tgSay(ctx, token, m.Chat.ID, fmt.Sprintf("Заказ №%d уже не ждёт подтверждения.", id), nil)
		return
	}

	// remember who opened the link: only they can press the button
	if _, err := pool.Exec(ctx, `UPDATE orders SET customer_chat_id = $1 WHERE id = $2`, m.From.ID, id); err != nil {
		log.Printf("bot: confirm save chat: %v", err)
	}
	msg := fmt.Sprintf("Заказ №%d\n%sИтого: %s\nПривезём до: %s\n\nВсё верно?",
		id, confirmLines(ctx, pool, id), rubFmt(total), deliverBy.In(moscow).Format("02.01 в 15:04"))
	tgSay(ctx, token, m.Chat.ID, msg, map[string]any{"inline_keyboard": [][]map[string]string{{
		{"text": "Подтверждаю", "callback_data": fmt.Sprintf("cf:%d:yes", id)},
	}}})
}

// the "Подтверждаю" button: confirm once, hand out the password, tell the owner
func handleConfirm(ctx context.Context, pool *pgxpool.Pool, token string, owner int64, cq *tgCallback, answer func(string)) {
	parts := strings.Split(cq.Data, ":")
	if len(parts) != 3 {
		answer("?")
		return
	}
	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		answer("?")
		return
	}
	word := literaryWords[rand.IntN(len(literaryWords))]
	var gift bool
	err = pool.QueryRow(ctx, `
		UPDATE orders SET confirmed_at = now(), confirm_word = $1
		WHERE id = $2 AND customer_chat_id = $3 AND confirmed_at IS NULL
		  AND status NOT IN ('cancelled', 'delivered')
		RETURNING gift`, word, id, cq.From.ID).Scan(&gift)
	if errors.Is(err, pgx.ErrNoRows) {
		answer("Уже подтверждён")
		return
	}
	if err != nil {
		log.Printf("bot: confirm %d: %v", id, err)
		answer("Ошибка, попробуйте ещё раз")
		return
	}
	answer("Спасибо!")

	done := fmt.Sprintf("\n\nПодтверждено. Литературный пароль: «%s»\nКурьер спросит его при доставке.", word)
	if gift {
		done += "\nЕсли это подарок, передайте пароль получателю."
	}
	if m := cq.Message; m != nil {
		if err := tgCall(ctx, token, "editMessageText", map[string]any{
			"chat_id": m.Chat.ID, "message_id": m.MessageID, "text": m.Text + done,
			"reply_markup": map[string]any{"inline_keyboard": [][]map[string]string{}},
		}, nil); err != nil {
			log.Printf("bot: confirm edit: %v", err)
		}
	}
	tgSay(ctx, token, owner, fmt.Sprintf("Заказ №%d подтверждён в Telegram. Пароль для курьера: «%s»", id, word), nil)
}

// GET /api/track/{token}/confirm: for the tracking page (whoever has the token has the order)
func confirmInfo(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		track := r.PathValue("token")
		var confirmed bool
		var word *string
		err := pool.QueryRow(r.Context(),
			`SELECT confirmed_at IS NOT NULL, confirm_word FROM orders WHERE track_token = $1`, track).Scan(&confirmed, &word)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "Нет такого заказа", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		out := map[string]any{"confirmed": confirmed, "word": word, "url": nil}
		if bot := os.Getenv("TELEGRAM_BOT_NAME"); bot != "" {
			out["url"] = "https://t.me/" + bot + "?start=" + track
		}
		writeJSON(w, http.StatusOK, out)
	}
}
