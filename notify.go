package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// notifyNewOrder sends you a Telegram message describing a fresh order.
// It runs in the background after the customer already got their answer,
// so a slow or unreachable Telegram never delays or breaks an order.
func notifyNewOrder(pool *pgxpool.Pool, orderID int64) {
	token, chatID := os.Getenv("TELEGRAM_BOT_TOKEN"), os.Getenv("TELEGRAM_CHAT_ID")
	if token == "" || chatID == "" {
		return // bot not configured: skip quietly
	}
	// own timeout: the request's context ends as soon as the customer's response is sent
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var (
		status, box, dtype, rName, rPhone, address, card string
		deliverBy                                         time.Time
		lat, lon                                          float64
		total                                             int
	)
	err := pool.QueryRow(ctx, `
		SELECT status::text, box_size, delivery_type::text, deliver_by,
		       recipient_name, recipient_phone, address, lat, lon, card_text, total_cents
		FROM orders WHERE id = $1`, orderID).Scan(
		&status, &box, &dtype, &deliverBy, &rName, &rPhone, &address, &lat, &lon, &card, &total)
	if err != nil {
		log.Printf("notify: order %d: %v", orderID, err)
		return
	}

	var b strings.Builder // efficient way to build a long string piece by piece
	fmt.Fprintf(&b, "Новый заказ #%d (%s)\n", orderID, status)
	fmt.Fprintf(&b, "Коробка %s, %s, до %s\n\n", box, dtype, deliverBy.In(moscow).Format("02.01 15:04"))

	// JOIN: combine each order line with its product, to get names instead of bare IDs
	rows, err := pool.Query(ctx, `
		SELECT p.name, i.quantity
		FROM order_items i JOIN products p ON p.id = i.product_id
		WHERE i.order_id = $1 ORDER BY p.name`, orderID)
	if err != nil {
		log.Printf("notify: items of order %d: %v", orderID, err)
		return
	}
	for rows.Next() {
		var name string
		var q int
		if err := rows.Scan(&name, &q); err == nil {
			fmt.Fprintf(&b, "• %s × %d\n", name, q)
		}
	}
	rows.Close()

	if card != "" {
		fmt.Fprintf(&b, "\nОткрытка: «%s»\n", card)
	}
	fmt.Fprintf(&b, "\nКому: %s, %s\n%s\n", rName, rPhone, address)
	fmt.Fprintf(&b, "https://yandex.ru/maps/?pt=%f,%f&z=17\n", lon, lat) // tap to open the pin
	fmt.Fprintf(&b, "\nИтого: %d,%02d ₽", total/100, total%100)       // cents to rubles,kopecks

	if err := sendTelegram(ctx, token, chatID, b.String()); err != nil {
		log.Printf("notify: order %d: %v", orderID, err)
	}
}

// sendTelegram calls the Bot API's sendMessage method
func sendTelegram(ctx context.Context, token, chatID, text string) error {
	body, _ := json.Marshal(map[string]string{"chat_id": chatID, "text": text})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.telegram.org/bot"+token+"/sendMessage", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err // note: never log req.URL, it contains the token
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram answered %s", resp.Status)
	}
	return nil
}
