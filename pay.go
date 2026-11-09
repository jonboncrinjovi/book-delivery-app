package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand/v2"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func tochkaBase() string {
	if b := os.Getenv("TOCHKA_API"); b != "" {
		return b // e.g. the sandbox, for testing
	}
	return "https://enter.tochka.com/uapi"
}

func siteURL() string {
	if s := os.Getenv("SITE_URL"); s != "" {
		return s
	}
	return "https://literalwine.ru"
}

// one request to Точка's API with the JWT key; the answer is decoded as generic JSON
func tochkaCall(ctx context.Context, method, path string, body any) (any, error) {
	var buf io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		buf = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, tochkaBase()+path, buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+os.Getenv("TOCHKA_JWT"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := tochkaHTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("tochka %s %s: %d %s", method, path, resp.StatusCode, data)
	}
	var out any
	err = json.Unmarshal(data, &out)
	return out, err
}

// the first string value under this key, anywhere in the answer (so small format differences don't break us)
func findString(v any, key string) string {
	switch t := v.(type) {
	case map[string]any:
		if s, ok := t[key].(string); ok {
			return s
		}
		for _, x := range t {
			if s := findString(x, key); s != "" {
				return s
			}
		}
	case []any:
		for _, x := range t {
			if s := findString(x, key); s != "" {
				return s
			}
		}
	}
	return ""
}

func cut(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

// +7XXXXXXXXXX from however the phone was typed
func normPhone(p string) string {
	d := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, p)
	if len(d) == 11 && d[0] == '8' {
		d = "7" + d[1:]
	}
	return "+" + d
}

type payOrder struct {
	ID, Total, Delivery int64
	Status, Name, Phone   string
	PaymentID, Link       string
	LinkAt                *time.Time
}

func loadPayOrder(ctx context.Context, pool *pgxpool.Pool, token string) (payOrder, error) {
	var o payOrder
	err := pool.QueryRow(ctx, `
		SELECT id, status::text, total_cents, delivery_fee_cents, customer_name, customer_phone,
		       COALESCE(payment_id, ''), COALESCE(payment_link, ''), payment_created_at
		FROM orders WHERE track_token = $1`, token).Scan(
		&o.ID, &o.Status, &o.Total, &o.Delivery, &o.Name, &o.Phone, &o.PaymentID, &o.Link, &o.LinkAt)
	return o, err
}

// the receipt: each item, delivery, and whatever remains of the total (packaging, prints) as one line
func receiptItems(ctx context.Context, pool *pgxpool.Pool, o payOrder, vat string) ([]map[string]any, error) {
	rows, err := pool.Query(ctx, `
		SELECT p.name, oi.quantity, oi.unit_price_cents, oi.hidden
		FROM order_items oi JOIN products p ON p.id = oi.product_id
		WHERE oi.order_id = $1 ORDER BY p.id`, o.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	line := func(name string, cents int64, qty int, object string) map[string]any {
		return map[string]any{
			"name": cut(name, 128), "amount": float64(cents) / 100, "quantity": qty,
			"vatType": vat, "paymentMethod": "full_prepayment", "paymentObject": object,
		}
	}
	var items []map[string]any
	var sum int64
	for rows.Next() {
		var name string
		var qty int
		var price int64
		var hidden bool
		if err := rows.Scan(&name, &qty, &price, &hidden); err != nil {
			return nil, err
		}
		if hidden {
			name = "Книга в закрытой упаковке" // the blind book: the kind of goods, not the title
		}
		items = append(items, line(name, price, qty, "goods"))
		sum += price * int64(qty)
	}
	if o.Delivery > 0 {
		items = append(items, line("Доставка", o.Delivery, 1, "service"))
		sum += o.Delivery
	}
	if rest := o.Total - sum; rest > 0 {
		items = append(items, line("Упаковка и оформление подарка", rest, 1, "goods"))
	}
	return items, nil
}

// GET /api/track/{token}/pay: whether this order can and should be paid online
func payInfo(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var enabled bool
		pool.QueryRow(r.Context(), `SELECT payments_enabled FROM settings`).Scan(&enabled)
		o, err := loadPayOrder(r.Context(), pool, r.PathValue("token"))
		if err != nil {
			http.Error(w, "Нет такого заказа", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"enabled": enabled, "due": o.Status == "awaiting_payment"})
	}
}

// POST /api/track/{token}/pay: a payment link with its receipt (reused while it's fresh)
func payStart(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		var enabled bool
		var tax, vat string
		pool.QueryRow(ctx, `SELECT payments_enabled, tax_system, vat_type FROM settings`).Scan(&enabled, &tax, &vat)
		if !enabled {
			http.Error(w, "Онлайн-оплата пока не подключена", http.StatusConflict)
			return
		}
		token := r.PathValue("token")
		o, err := loadPayOrder(ctx, pool, token)
		if err != nil {
			http.Error(w, "Нет такого заказа", http.StatusNotFound)
			return
		}
		if o.Status != "awaiting_payment" {
			http.Error(w, "Этот заказ не ждёт оплаты", http.StatusConflict)
			return
		}
		if o.Link != "" && o.LinkAt != nil && time.Since(*o.LinkAt) < 55*time.Minute {
			writeJSON(w, http.StatusOK, map[string]string{"url": o.Link})
			return
		}
		items, err := receiptItems(ctx, pool, o, vat)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		body := map[string]any{"Data": map[string]any{
			"customerCode":    os.Getenv("TOCHKA_CUSTOMER_CODE"),
			"merchantId":      os.Getenv("TOCHKA_MERCHANT_ID"),
			"amount":          float64(o.Total) / 100,
			"purpose":         fmt.Sprintf("Заказ №%d, literalwine.ru", o.ID),
			"paymentMode":     []string{"sbp", "card", "tinkoff"},
			"redirectUrl":     siteURL() + "/order/" + token + "?paid=1",
			"failRedirectUrl": siteURL() + "/order/" + token + "?failed=1",
			"ttl":             60,
			"taxSystemCode":   tax,
			"Client":          map[string]string{"name": cut(o.Name, 64), "phone": normPhone(o.Phone)},
			"Items":           items,
		}}
		res, err := tochkaCall(ctx, "POST", "/acquiring/v1.0/payments_with_receipt", body)
		if err != nil {
			log.Printf("pay: order %d: %v", o.ID, err)
			http.Error(w, "Не удалось создать оплату, попробуйте через минуту", http.StatusBadGateway)
			return
		}
		opID, link := findString(res, "operationId"), findString(res, "paymentLink")
		if opID == "" || link == "" {
			log.Printf("pay: order %d: unexpected answer %v", o.ID, res)
			http.Error(w, "Не удалось создать оплату", http.StatusBadGateway)
			return
		}
		pool.Exec(ctx, `UPDATE orders SET payment_id = $1, payment_link = $2, payment_created_at = now() WHERE id = $3`, opID, link, o.ID)
		writeJSON(w, http.StatusOK, map[string]string{"url": link})
	}
}

// asks Точка about the payment; on APPROVED the order becomes paid
func checkPayment(ctx context.Context, pool *pgxpool.Pool, id int64, opID string) (bool, error) {
	res, err := tochkaCall(ctx, "GET", "/acquiring/v1.0/payments/"+opID, nil)
	if err != nil {
		return false, err
	}
	if findString(res, "status") != "APPROVED" {
		return false, nil
	}
	return true, markPaid(ctx, pool, id)
}

// paid: status, the literary password (unless already confirmed in Telegram), the history, the messages
func markPaid(ctx context.Context, pool *pgxpool.Pool, id int64) error {
	word := literaryWords[rand.IntN(len(literaryWords))]
	var pass string
	var gift bool
	var chat *int64
	var total int
	err := pool.QueryRow(ctx, `
		UPDATE orders SET status = 'paid', paid_at = now(),
		       confirmed_at = COALESCE(confirmed_at, now()), confirm_word = COALESCE(confirm_word, $1)
		WHERE id = $2 AND status = 'awaiting_payment'
		RETURNING confirm_word, gift, customer_chat_id, total_cents`, word, id).Scan(&pass, &gift, &chat, &total)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil // already marked, by the poller or the return page
	}
	if err != nil {
		return err
	}
	pool.Exec(ctx, `INSERT INTO order_events (order_id, status) VALUES ($1, 'paid'::order_status)`, id)

	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	owner, _ := strconv.ParseInt(os.Getenv("TELEGRAM_CHAT_ID"), 10, 64)
	if token == "" {
		return nil
	}
	if owner != 0 {
		tgSay(ctx, token, owner, fmt.Sprintf("Заказ №%d оплачен: %s. Пароль для курьера: «%s»", id, rubFmt(total), pass), nil)
	}
	if chat != nil {
		msg := fmt.Sprintf("Оплата заказа №%d получена, спасибо!\nЛитературный пароль: «%s»\nКурьер спросит его при доставке.", id, pass)
		if gift {
			msg += "\nЕсли это подарок, передайте пароль получателю."
		}
		tgSay(ctx, token, *chat, msg, map[string]any{"inline_keyboard": [][]map[string]string{{{"text": "Наш канал: книги и новости", "url": shopChannel}}}})
	}
	return nil
}

// POST /api/track/{token}/check: right after the customer returns from the payment page
func payCheck(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		o, err := loadPayOrder(r.Context(), pool, r.PathValue("token"))
		if err != nil || o.PaymentID == "" {
			writeJSON(w, http.StatusOK, map[string]bool{"paid": o.Status == "paid"})
			return
		}
		paid := o.Status == "paid"
		if o.Status == "awaiting_payment" {
			if p, err := checkPayment(r.Context(), pool, o.ID, o.PaymentID); err != nil {
				log.Printf("pay check %d: %v", o.ID, err)
			} else {
				paid = p
			}
		}
		writeJSON(w, http.StatusOK, map[string]bool{"paid": paid})
	}
}

// every minute: unpaid orders with a recent link are checked with the bank,
// so a customer who pays and closes the page is still marked paid
func paymentPoller(pool *pgxpool.Pool) {
	for range time.Tick(time.Minute) {
		ctx, cancel := context.WithTimeout(context.Background(), 50*time.Second)
		rows, err := pool.Query(ctx, `
			SELECT id, payment_id FROM orders
			WHERE status = 'awaiting_payment' AND payment_id IS NOT NULL
			  AND payment_created_at > now() - interval '3 hours'`)
		if err == nil {
			type pending struct {
				id   int64
				opID string
			}
			var list []pending
			for rows.Next() {
				var p pending
				if rows.Scan(&p.id, &p.opID) == nil {
					list = append(list, p)
				}
			}
			rows.Close()
			for _, p := range list {
				if _, err := checkPayment(ctx, pool, p.id, p.opID); err != nil {
					log.Printf("pay poll %d: %v", p.id, err)
				}
			}
		}
		cancel()
	}
}
