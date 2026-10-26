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
		status, packaging, dtype, gift, rName, rPhone, address, card string
		deliverBy                                                    time.Time
		lat, lon                                                     float64
		total                                                        int
	)
	// the CASE expressions turn codes into readable text:
	// "пакет, винный" / "пакет, цвет на твой выбор" / "коробка M",
	// and "Подарок: Маме, День рождения" / "Для себя"
	err := pool.QueryRow(ctx, `
		SELECT status::text,
		       CASE WHEN box_size = 'BAG'
		            THEN 'пакет, ' || coalesce((SELECT name FROM bag_colors WHERE code = bag_color), 'цвет на твой выбор')
		            ELSE 'коробка ' || box_size END,
		       delivery_type::text, deliver_by,
		       CASE WHEN gift
		            THEN 'Подарок: ' || coalesce((SELECT name FROM recipients WHERE code = recipient), '?')
		                 || ', ' || coalesce((SELECT name FROM occasions WHERE code = occasion), '?')
		            ELSE 'Для себя' END,
		       recipient_name, recipient_phone, address, lat, lon, card_text, total_cents
		FROM orders WHERE id = $1`, orderID).Scan(
		&status, &packaging, &dtype, &deliverBy, &gift,
		&rName, &rPhone, &address, &lat, &lon, &card, &total)
	if err != nil {
		log.Printf("notify: order %d: %v", orderID, err)
		return
	}

	var b strings.Builder // efficient way to build a long string piece by piece
	fmt.Fprintf(&b, "Новый заказ #%d (%s)\n", orderID, status)
	fmt.Fprintf(&b, "%s, %s, до %s\n", packaging, dtype, deliverBy.In(moscow).Format("02.01 15:04"))
	fmt.Fprintf(&b, "%s\n\n", gift)

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

	if err := tgCall(ctx, token, "sendMessage", map[string]any{
		"chat_id": chatID, "text": b.String(), "reply_markup": keyboard(orderID, status),
	}, nil); err != nil {
		log.Printf("notify: order %d: %v", orderID, err)
	}
}
