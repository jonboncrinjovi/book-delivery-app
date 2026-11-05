package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// keep in step with frontend/lib/company.ts
const (
	shopEmail = "info@literalwine.ru"
	shopPhone = "+7 981 752-84-58"
	shopHours = "ежедневно с 9:00 до 22:00"
)

// sendReturnNotice tells the customer how returns work at the moment of delivery (ст. 26.1 ЗоЗПП)
// and records when it was sent
func sendReturnNotice(pool *pgxpool.Pool, token string, id int64) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	var chat *int64
	if err := pool.QueryRow(ctx, `SELECT customer_chat_id FROM orders WHERE id = $1`, id).Scan(&chat); err != nil || chat == nil {
		return
	}
	text := fmt.Sprintf("Заказ №%d доставлен. Спасибо, что выбрали нас!\n\n"+
		"Как вернуть товар\n"+
		"Отказаться от товара надлежащего качества можно в течение 7 дней после получения, если сохранились его товарный вид и потребительские свойства и есть подтверждение покупки. "+
		"Обратная доставка за счёт покупателя, деньги вернём не позднее 10 дней с момента требования. "+
		"Если с товаром что-то не так, напишите нам, и мы всё исправим.\n\n"+
		"%s, %s (%s)\nПодробно: https://literalwine.ru/legal/delivery",
		id, shopEmail, shopPhone, shopHours)
	if err := tgCall(ctx, token, "sendMessage", map[string]any{"chat_id": *chat, "text": text}, nil); err != nil {
		log.Printf("bot: return notice %d: %v", id, err)
		return
	}
	if _, err := pool.Exec(ctx, `UPDATE orders SET return_notice_at = now() WHERE id = $1`, id); err != nil {
		log.Printf("bot: return notice %d saved: %v", id, err)
	}
}
