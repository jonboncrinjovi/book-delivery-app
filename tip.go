package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// POST /api/track/{token}/tip {"amount": 200, "email": "…"}: a payment link for a tip, with its receipt line
func tipStart(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		var enabled bool
		var tax, vat string
		pool.QueryRow(ctx, `SELECT payments_enabled, tax_system, vat_type FROM settings`).Scan(&enabled, &tax, &vat)
		if !enabled {
			http.Error(w, "Онлайн-оплата пока не подключена", http.StatusConflict)
			return
		}
		var in struct {
			Amount int    `json:"amount"`
			Email  string `json:"email"`
		}
		json.NewDecoder(r.Body).Decode(&in)
		email := strings.TrimSpace(in.Email)
		at := strings.LastIndex(email, "@")
		if at < 1 || !strings.Contains(email[at+1:], ".") {
			http.Error(w, "Укажите e-mail: на него придёт чек", http.StatusBadRequest)
			return
		}
		if in.Amount < 50 || in.Amount > 10000 {
			http.Error(w, "От 50 до 10 000 ₽", http.StatusBadRequest)
			return
		}
		token := r.PathValue("token")
		o, err := loadPayOrder(ctx, pool, token)
		if err != nil {
			http.Error(w, "Нет такого заказа", http.StatusNotFound)
			return
		}
		if o.Status != "delivered" {
			http.Error(w, "Чаевые можно оставить после доставки", http.StatusConflict)
			return
		}
		cents := int64(in.Amount) * 100
		var tipID int64
		if err := pool.QueryRow(ctx, `INSERT INTO order_tips (order_id, amount_cents) VALUES ($1, $2) RETURNING id`,
			o.ID, cents).Scan(&tipID); err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		body := map[string]any{"Data": map[string]any{
			"customerCode":    os.Getenv("TOCHKA_CUSTOMER_CODE"),
			"merchantId":      os.Getenv("TOCHKA_MERCHANT_ID"),
			"amount":          float64(cents) / 100,
			"purpose":         fmt.Sprintf("Чаевые к заказу №%d, literalwine.ru", o.ID),
			"paymentMode":     []string{"sbp", "card", "tinkoff"},
			"redirectUrl":     siteURL() + "/order/" + token + "?tip=1",
			"failRedirectUrl": siteURL() + "/order/" + token + "?tipfailed=1",
			"ttl":             60,
			"taxSystemCode":   tax,
			"Client":          map[string]string{"name": cut(o.Name, 64), "phone": normPhone(o.Phone), "email": email},
			"Items": []map[string]any{{
				"name": "Чаевые", "amount": float64(cents) / 100, "quantity": 1,
				"vatType": vat, "paymentMethod": "full_payment", "paymentObject": "service",
			}},
		}}
		res, err := tochkaCall(ctx, "POST", "/acquiring/v1.0/payments_with_receipt", body)
		if err != nil {
			log.Printf("tip: order %d: %v", o.ID, err)
			http.Error(w, "Не удалось создать оплату, попробуйте через минуту", http.StatusBadGateway)
			return
		}
		opID, link := findString(res, "operationId"), findString(res, "paymentLink")
		if opID == "" || link == "" {
			http.Error(w, "Не удалось создать оплату", http.StatusBadGateway)
			return
		}
		pool.Exec(ctx, `UPDATE order_tips SET payment_id = $1 WHERE id = $2`, opID, tipID)
		writeJSON(w, http.StatusOK, map[string]string{"url": link})
	}
}

// asks Точка about recent unpaid tips (of one order, or of all when orderID is 0); paid ones are marked and announced
func checkTips(ctx context.Context, pool *pgxpool.Pool, orderID int64) (paid int) {
	rows, err := pool.Query(ctx, `
		SELECT id, payment_id FROM order_tips
		WHERE paid_at IS NULL AND payment_id IS NOT NULL AND created_at > now() - interval '3 hours'
		  AND ($1 = 0 OR order_id = $1)`, orderID)
	if err != nil {
		return 0
	}
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
		res, err := tochkaCall(ctx, "GET", "/acquiring/v1.0/payments/"+p.opID, nil)
		if err != nil || findString(res, "status") != "APPROVED" {
			continue
		}
		var oid int64
		var amount int
		if pool.QueryRow(ctx, `UPDATE order_tips SET paid_at = now() WHERE id = $1 AND paid_at IS NULL
			RETURNING order_id, amount_cents`, p.id).Scan(&oid, &amount) != nil {
			continue
		}
		paid++
		token := os.Getenv("TELEGRAM_BOT_TOKEN")
		owner, _ := strconv.ParseInt(os.Getenv("TELEGRAM_CHAT_ID"), 10, 64)
		if token != "" && owner != 0 {
			tgSay(ctx, token, owner, fmt.Sprintf("Чаевые %s за заказ №%d. Спасибо, команда!", rubFmt(amount), oid), nil)
		}
	}
	return paid
}

// POST /api/track/{token}/tipcheck: right after returning from the payment page
func tipCheck(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		o, err := loadPayOrder(r.Context(), pool, r.PathValue("token"))
		if err != nil {
			http.Error(w, "Нет такого заказа", http.StatusNotFound)
			return
		}
		var paid bool
		pool.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM order_tips WHERE order_id = $1 AND paid_at IS NOT NULL)`, o.ID).Scan(&paid)
		if !paid {
			paid = checkTips(r.Context(), pool, o.ID) > 0
		}
		writeJSON(w, http.StatusOK, map[string]bool{"paid": paid})
	}
}

// every minute: tips paid by people who closed the page before coming back
func tipPoller(pool *pgxpool.Pool) {
	for range time.Tick(time.Minute) {
		ctx, cancel := context.WithTimeout(context.Background(), 50*time.Second)
		checkTips(ctx, pool, 0)
		cancel()
	}
}
