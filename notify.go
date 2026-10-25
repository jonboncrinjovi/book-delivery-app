package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// notifyNewOrder sends you a Telegram message about a fresh order, with status buttons.
// It runs in the background, so Telegram problems never affect the order itself.
func notifyNewOrder(pool *pgxpool.Pool, orderID int64) {
	token, chatID := os.Getenv("TELEGRAM_BOT_TOKEN"), os.Getenv("TELEGRAM_CHAT_ID")
	if token == "" || chatID == "" {
		return
	}
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

	var b strings.Builder
	fmt.Fprintf(&b, "Новый заказ #%d (%s)\n", orderID, status)
	fmt.Fprintf(&b, "Коробка %s, %s, до %s\n\n", box, dtype, deliverBy.In(moscow).Format("02.01 15:04"))

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
	fmt.Fprintf(&b, "https://yandex.ru/maps/?pt=%f,%f&z=17\n", lon, lat)
	fmt.Fprintf(&b, "\nИтого: %d,%02d ₽", total/100, total%100)

	if err := tgCall(ctx, token, "sendMessage", map[string]any{
		"chat_id": chatID, "text": b.String(), "reply_markup": keyboard(orderID, status),
	}, nil); err != nil {
		log.Printf("notify: order %d: %v", orderID, err)
	}
}
