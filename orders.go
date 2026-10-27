package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"
	_ "time/tzdata" // timezone data inside the binary; redundant with distroless, but harmless

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var moscow = mustLoadLocation("Europe/Moscow")

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

type OrderItemReq struct {
	ProductID int64 `json:"product_id"`
	Quantity  int   `json:"quantity"`
	Hidden    bool  `json:"hidden"` // blind-date book: stays a surprise
}

// what the customer sends; note: no prices, no totals. The server decides those.
type OrderReq struct {
	DryRun         bool           `json:"dry_run"`   // true = only calculate the price, save nothing
	BoxSize        string         `json:"box_size"`  // empty = the paper bag
	BagColor       *string        `json:"bag_color"` // nil = surprise: you choose when packing
	Gift           bool           `json:"gift"`
	Recipient      *string        `json:"recipient"`
	Occasion       *string        `json:"occasion"`
	BoxDesignID    *int64         `json:"box_design_id"`
	CardDesignID   *int64         `json:"card_design_id"`
	CardText       string         `json:"card_text"`
	CustomerName   string         `json:"customer_name"`
	CustomerPhone  string         `json:"customer_phone"`
	RecipientName  string         `json:"recipient_name"`
	RecipientPhone string         `json:"recipient_phone"`
	Address        string         `json:"address"`
	Lat            float64        `json:"lat"`
	Lon            float64        `json:"lon"`
	DeliveryType   string         `json:"delivery_type"`
	Items          []OrderItemReq `json:"items"`
}

type OrderResp struct {
	ID               int64     `json:"id,omitempty"`    // empty for a dry run
	Track            string    `json:"track,omitempty"` // secret part of the tracking link
	Status           string    `json:"status"`
	SubtotalCents    int       `json:"subtotal_cents"`
	DeliveryFeeCents int       `json:"delivery_fee_cents"`
	TotalCents       int       `json:"total_cents"`
	DeliverBy        time.Time `json:"deliver_by"`
}

type settings struct {
	DeliveryFee, ExpressFee, KmFee int
	FreeFrom                       *int
	CenterLat, CenterLon           float64
	RadiusKm, MaxKm                float64
	CutoffHour, UntilHour          int
}

// badRequest marks errors caused by the customer's input (answered with 400, message shown to them),
// as opposed to server failures (answered with 500, details hidden)
type badRequest struct{ msg string }

func (e badRequest) Error() string { return e.msg }

func createOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req OrderReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Некорректный запрос", http.StatusBadRequest)
			return
		}
		resp, err := placeOrder(r.Context(), pool, req, time.Now().In(moscow))
		var br badRequest
		switch {
		case errors.As(err, &br):
			http.Error(w, br.msg, http.StatusBadRequest)
		case err != nil:
			http.Error(w, "Не получилось оформить заказ, попробуй ещё раз", http.StatusInternalServerError)
		case req.DryRun:
			writeJSON(w, http.StatusOK, resp) // just the price
		default:
			// logged-in customer: attach the order to their account
			if uid := userID(r.Context(), pool, r); uid != 0 {
				pool.Exec(r.Context(), `UPDATE orders SET user_id = $1 WHERE id = $2`, uid, resp.ID)
			}
			go notifyNewOrder(pool, resp.ID) // "go" = run in the background, don't wait for it
			writeJSON(w, http.StatusCreated, resp)
		}
	}
}

func placeOrder(ctx context.Context, pool *pgxpool.Pool, req OrderReq, now time.Time) (OrderResp, error) {
	var resp OrderResp

	// 1. checks that need no database; contact details aren't needed for a price quote
	if !req.DryRun && (req.CustomerName == "" || req.CustomerPhone == "" || req.RecipientName == "" ||
		req.RecipientPhone == "" || strings.TrimSpace(req.Address) == "") {
		return resp, badRequest{"Укажи имя, телефон и адрес"}
	}
	if req.DeliveryType != "standard" && req.DeliveryType != "express" {
		return resp, badRequest{"Неизвестный способ доставки"}
	}
	if len(req.Items) == 0 {
		return resp, badRequest{"Корзина пуста"}
	}

	// packaging: the bag is the default; a colour only makes sense for the bag
	if req.BoxSize == "" {
		req.BoxSize = "BAG"
	}
	if req.BoxSize != "BAG" {
		req.BagColor = nil
	}
	if !req.Gift {
		req.Recipient, req.Occasion = nil, nil
	}

	// merge duplicates: the same product listed twice becomes one line
	qty := map[int64]int{}
	hidden := map[int64]bool{}
	for _, it := range req.Items {
		if it.Quantity <= 0 {
			return resp, badRequest{"Количество должно быть больше нуля"}
		}
		qty[it.ProductID] += it.Quantity
		hidden[it.ProductID] = hidden[it.ProductID] || it.Hidden
	}
	// fixed lock order, so two simultaneous orders can't deadlock each other
	ids := make([]int64, 0, len(qty))
	for id := range qty {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	// transaction: either every step below happens, or none of it does
	tx, err := pool.Begin(ctx)
	if err != nil {
		return resp, err
	}
	defer tx.Rollback(ctx) // undoes everything on any early return, and for dry runs; harmless after Commit

	// 2. settings
	var s settings
	err = tx.QueryRow(ctx, `
		SELECT delivery_fee_cents, express_fee_cents, outside_km_fee_cents, free_delivery_from_cents,
		       city_center_lat, city_center_lon, city_radius_km, max_radius_km,
		       order_cutoff_hour, deliver_until_hour
		FROM settings`).Scan(
		&s.DeliveryFee, &s.ExpressFee, &s.KmFee, &s.FreeFrom,
		&s.CenterLat, &s.CenterLon, &s.RadiusKm, &s.MaxKm,
		&s.CutoffHour, &s.UntilHour)
	if err != nil {
		return resp, err
	}

	// 3. delivery area
	dist := haversineKm(s.CenterLat, s.CenterLon, req.Lat, req.Lon)
	if dist > s.MaxKm {
		return resp, badRequest{"Сюда мы пока не доставляем"}
	}

	// 4. packaging: bag or box
	var capacity *int
	var boxPrice int
	err = tx.QueryRow(ctx, `SELECT capacity_slots, price_cents FROM box_sizes WHERE code = $1`,
		req.BoxSize).Scan(&capacity, &boxPrice)
	if errors.Is(err, pgx.ErrNoRows) {
		return resp, badRequest{"Неизвестная упаковка"}
	}
	if err != nil {
		return resp, err
	}

	// every code the customer sent must exist in its lookup table
	for _, c := range []struct {
		table string
		code  *string
	}{{"bag_colors", req.BagColor}, {"recipients", req.Recipient}, {"occasions", req.Occasion}} {
		ok, err := codeExists(ctx, tx, c.table, c.code)
		if err != nil {
			return resp, err
		}
		if !ok {
			return resp, badRequest{"Неизвестное значение: " + c.table}
		}
	}

	// 5. products: lock each row, check it, price it
	itemsTotal, slots := 0, 0
	prices := map[int64]int{}
	for _, id := range ids {
		var name string
		var price, stock, sl int
		var active bool
		// FOR UPDATE locks the row until the transaction ends: two buyers can't both take the last copy
		err := tx.QueryRow(ctx,
			`SELECT name, price_cents, stock, slots, active FROM products WHERE id = $1 FOR UPDATE`,
			id).Scan(&name, &price, &stock, &sl, &active)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && !active) {
			return resp, badRequest{"Один из товаров больше недоступен"}
		}
		if err != nil {
			return resp, err
		}
		if stock < qty[id] {
			if hidden[id] {
				name = "книги-сюрприза" // don't spoil the blind date in an error message
			}
			return resp, badRequest{fmt.Sprintf("Осталось только %d шт. %s", stock, name)}
		}
		prices[id] = price
		itemsTotal += price * qty[id]
		slots += sl * qty[id]
	}
	if capacity != nil && slots > *capacity {
		return resp, badRequest{fmt.Sprintf("Не помещается: нужно %d мест, а в упаковке %d", slots, *capacity)}
	}

	// 6. designs: must exist, be active, and be the right kind
	designTotal := 0
	for _, d := range []struct {
		id   *int64
		kind string
	}{{req.BoxDesignID, "box_print"}, {req.CardDesignID, "card"}} {
		if d.id == nil {
			continue
		}
		var price int
		err := tx.QueryRow(ctx,
			`SELECT price_cents FROM designs WHERE id = $1 AND kind::text = $2 AND active`,
			*d.id, d.kind).Scan(&price)
		if errors.Is(err, pgx.ErrNoRows) {
			return resp, badRequest{"Неизвестный дизайн"}
		}
		if err != nil {
			return resp, err
		}
		designTotal += price
	}

	subtotal := itemsTotal + boxPrice + designTotal

	// 7. delivery fee
	fee := s.DeliveryFee
	if s.FreeFrom != nil && subtotal >= *s.FreeFrom {
		fee = 0
	}
	if extra := dist - s.RadiusKm; extra > 0 {
		fee += int(math.Ceil(extra)) * s.KmFee // every started kilometre counts
	}

	// 8. deadline
	cutoff := time.Date(now.Year(), now.Month(), now.Day(), s.CutoffHour, 0, 0, 0, moscow)
	until := time.Date(now.Year(), now.Month(), now.Day(), s.UntilHour, 0, 0, 0, moscow)
	var deliverBy time.Time
	switch {
	case req.DeliveryType == "express" && now.Before(cutoff):
		fee += s.ExpressFee
		deliverBy = now.Add(2 * time.Hour)
	case req.DeliveryType == "express":
		return resp, badRequest{fmt.Sprintf("Экспресс-доставка доступна до %d:00", s.CutoffHour)}
	case now.Before(cutoff):
		deliverBy = until // today
	default:
		deliverBy = until.AddDate(0, 0, 1) // tomorrow
	}

	status := "awaiting_payment"
	if capacity == nil {
		status = "awaiting_quote" // custom box: you price it by hand before payment
	}

	resp.Status = status
	resp.SubtotalCents = subtotal
	resp.DeliveryFeeCents = fee
	resp.TotalCents = subtotal + fee
	resp.DeliverBy = deliverBy

	// a price quote ends here: nothing is written, and the deferred Rollback releases the locks
	if req.DryRun {
		return resp, nil
	}

	// 9. write the order, its items, and reduce stock
	err = tx.QueryRow(ctx, `
		INSERT INTO orders (status, box_size, box_design_id, card_design_id, card_text,
			customer_name, customer_phone, recipient_name, recipient_phone, address, lat, lon,
			delivery_type, deliver_by, subtotal_cents, delivery_fee_cents, total_cents,
			bag_color, gift, recipient, occasion)
		VALUES ($1::order_status, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
			$13::delivery_type, $14, $15, $16, $17, $18, $19, $20, $21)
		RETURNING id, track_token`,
		status, req.BoxSize, req.BoxDesignID, req.CardDesignID, req.CardText,
		req.CustomerName, req.CustomerPhone, req.RecipientName, req.RecipientPhone,
		req.Address, req.Lat, req.Lon, req.DeliveryType, deliverBy,
		subtotal, fee, subtotal+fee,
		req.BagColor, req.Gift, req.Recipient, req.Occasion).Scan(&resp.ID, &resp.Track)
	if err != nil {
		return resp, err
	}
	for _, id := range ids {
		if _, err := tx.Exec(ctx, `
			INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents, hidden)
			VALUES ($1, $2, $3, $4, $5)`,
			resp.ID, id, qty[id], prices[id], hidden[id]); err != nil {
			return resp, err
		}
		if _, err := tx.Exec(ctx,
			`UPDATE products SET stock = stock - $1 WHERE id = $2`, qty[id], id); err != nil {
			return resp, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return resp, err
	}
	return resp, nil
}

// codeExists checks a code against a lookup table; nil means "not given", which is fine.
// table is always one of our own constants, never user input, so putting it into the SQL is safe.
func codeExists(ctx context.Context, tx pgx.Tx, table string, code *string) (bool, error) {
	if code == nil {
		return true, nil
	}
	var ok bool
	err := tx.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM "+table+" WHERE code = $1)", *code).Scan(&ok)
	return ok, err
}

// haversineKm: straight-line distance between two points on Earth's surface, in km
func haversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusKm = 6371.0
	rad := math.Pi / 180 // degrees to radians
	dLat := (lat2 - lat1) * rad
	dLon := (lon2 - lon1) * rad
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*rad)*math.Cos(lat2*rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
	return 2 * earthRadiusKm * math.Asin(math.Sqrt(a))
}
