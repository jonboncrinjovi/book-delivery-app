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
	_ "time/tzdata"

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
	ProductID int64     `json:"product_id"`
	Quantity  int       `json:"quantity"`
	Hidden    bool      `json:"hidden"`
	Print     *PrintReq `json:"print"` // the design, for cards and wrapping printed to order
}

// what the customer sends; no prices, no totals: the server decides those
type OrderReq struct {
	DryRun         bool           `json:"dry_run"`
	BoxSize        string         `json:"box_size"`
	BagColor       *string        `json:"bag_color"`
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
	Lat            float64        `json:"lat"` // 0,0 = not given: the server looks the address up
	Lon            float64        `json:"lon"`
	DeliveryType   string         `json:"delivery_type"`
	Items          []OrderItemReq `json:"items"`
}

type OrderResp struct {
	ID               int64     `json:"id,omitempty"`
	Track            string    `json:"track,omitempty"`
	Status           string    `json:"status"`
	SubtotalCents    int       `json:"subtotal_cents"`
	DeliveryFeeCents int       `json:"delivery_fee_cents"`
	TotalCents       int       `json:"total_cents"`
	DeliverBy        time.Time `json:"deliver_by"`
	Geocoded         bool      `json:"geocoded"` // false: address not found, delivery price to be confirmed
}

type settings struct {
	DeliveryFee, ExpressFee, KmFee int
	FreeFrom                       *int
	CenterLat, CenterLon           float64
	RadiusKm, MaxKm                float64
	CutoffHour, UntilHour          int
}

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
			http.Error(w, "Не получилось оформить заказ, попробуйте ещё раз", http.StatusInternalServerError)
		case req.DryRun:
			writeJSON(w, http.StatusOK, resp)
		default:
			if uid := userID(r.Context(), pool, r); uid != 0 {
				pool.Exec(r.Context(), `UPDATE orders SET user_id = $1 WHERE id = $2`, uid, resp.ID)
				// remember the phone for next time; the address only if it's their own, not a gift recipient's
				if req.Gift {
					pool.Exec(r.Context(), `UPDATE users SET phone = $1 WHERE id = $2`, req.CustomerPhone, uid)
				} else {
					pool.Exec(r.Context(), `UPDATE users SET phone = $1, address = $2 WHERE id = $3`,
						req.CustomerPhone, req.Address, uid)
				}
			}
			go notifyNewOrder(pool, resp.ID)
			go makePrints(pool, resp.ID)
			writeJSON(w, http.StatusCreated, resp)
		}
	}
}

func placeOrder(ctx context.Context, pool *pgxpool.Pool, req OrderReq, now time.Time) (OrderResp, error) {
	var resp OrderResp

	// 1. checks that need no database; contact details aren't needed for a price quote
	if !req.DryRun && (req.CustomerName == "" || req.CustomerPhone == "" || req.RecipientName == "" ||
		req.RecipientPhone == "" || strings.TrimSpace(req.Address) == "") {
		return resp, badRequest{"Укажите имя, телефон и адрес"}
	}
	if req.DeliveryType != "standard" && req.DeliveryType != "express" {
		return resp, badRequest{"Неизвестный способ доставки"}
	}
	if len(req.Items) == 0 {
		return resp, badRequest{"Корзина пуста"}
	}
	if req.BoxSize == "" {
		req.BoxSize = "BAG"
	}
	if req.BoxSize != "BAG" {
		req.BagColor = nil
	}
	if !req.Gift {
		req.Recipient, req.Occasion = nil, nil
	}

	qty := map[int64]int{}
	hidden := map[int64]bool{}
	prints := map[int64]*PrintReq{}
	for _, it := range req.Items {
		if it.Quantity <= 0 {
			return resp, badRequest{"Количество должно быть больше нуля"}
		}
		qty[it.ProductID] += it.Quantity
		hidden[it.ProductID] = hidden[it.ProductID] || it.Hidden
		if it.Print != nil {
			if _, dup := prints[it.ProductID]; dup {
				return resp, badRequest{"В заказе может быть одна открытка каждого размера и одна упаковка"}
			}
			prints[it.ProductID] = it.Print
		}
	}
	ids := make([]int64, 0, len(qty))
	for id := range qty {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	// 2. settings (read before the transaction: the address lookup below may take a second,
	//    and we don't want to hold locks on products meanwhile)
	var s settings
	err := pool.QueryRow(ctx, `
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

	// 3. where to: coordinates from the address when none were sent;
	//    if it can't be found, price it as in-city and flag it for you to confirm
	resp.Geocoded = true
	if req.Lat == 0 && req.Lon == 0 {
		if lat, lon, ok := geocode(ctx, req.Address); ok {
			req.Lat, req.Lon = lat, lon
		} else {
			req.Lat, req.Lon = s.CenterLat, s.CenterLon
			resp.Geocoded = false
		}
	}
	dist := haversineKm(s.CenterLat, s.CenterLon, req.Lat, req.Lon)
	if dist > s.MaxKm {
		return resp, badRequest{"Сюда мы пока не доставляем"}
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return resp, err
	}
	defer tx.Rollback(ctx)

    // the daily cap: today's orders are counted under a lock, so two orders arriving
    // in the same second can't both slip through as the last one 
    if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(20261109)`); err != nil {
        return resp, err
    }
    var maxDay, today int
    if err := tx.QueryRow(ctx, `
        SELECT (SELECT max_orders_day FROM settings),
               (SELECT count(*) FROM orders
                WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date = (now() AT TIME ZONE 'Europe/Moscow')::date
                  AND status::text NOT IN ('cancelled', 'cancelled'))`).Scan(&maxDay, &today); err != nil {
        return resp, err
    }
    if maxDay > 0 && today >= maxDay {
      return resp, badRequest{"На сегодня мы уже приняли все заказы, которые успеем доставить. Приходите завтра!"}
    }

	// 4. packaging
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

	// 5. products
	itemsTotal, slots := 0, 0
	prices := map[int64]int{}
	for _, id := range ids {
		var name string
		var price, stock, sl int
		var active bool
		var printKind *string
		err := tx.QueryRow(ctx,
			`SELECT name, price_cents, stock, slots, active, print_kind FROM products WHERE id = $1 FOR UPDATE`,
			id).Scan(&name, &price, &stock, &sl, &active, &printKind)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && !active) {
			return resp, badRequest{"Один из товаров больше недоступен"}
		}
		if err != nil {
			return resp, err
		}
		if stock < qty[id] {
			if hidden[id] {
				name = "книги-сюрприза"
			}
			return resp, badRequest{fmt.Sprintf("Осталось только %d шт. %s", stock, name)}
		}
		if printKind != nil {
			if qty[id] != 1 {
				return resp, badRequest{"Открытку и упаковку печатаем в одном экземпляре"}
			}
			if err := checkPrint(ctx, tx, *printKind, prints[id]); err != nil {
				return resp, err
			}
		} else {
			delete(prints, id)
		}
		prices[id] = price
		itemsTotal += price * qty[id]
		slots += sl * qty[id]
	}
	if capacity != nil && slots > *capacity {
		return resp, badRequest{fmt.Sprintf("Не помещается: нужно %d мест, а в упаковке %d", slots, *capacity)}
	}

	// 6. designs
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

	// 6a. the smallest order we carry: money paid for goods (bonuses, once they can be spent, come off before this)
	var minOrder int
	if err := pool.QueryRow(ctx, `SELECT min_order_cents FROM settings`).Scan(&minOrder); err != nil {
		return resp, err
	}
	if subtotal < minOrder {
		return resp, badRequest{fmt.Sprintf("Минимальный заказ — %d ₽, не считая доставки", minOrder/100)}
	}

	// 7. delivery fee
	fee := s.DeliveryFee
	if s.FreeFrom != nil && subtotal >= *s.FreeFrom {
		fee = 0
	}
	if extra := dist - s.RadiusKm; extra > 0 {
		fee += int(math.Ceil(extra)) * s.KmFee
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
		deliverBy = until
	default:
		deliverBy = until.AddDate(0, 0, 1)
	}

	status := "awaiting_payment"
	if capacity == nil {
		status = "awaiting_quote"
	}

	resp.Status = status
	resp.SubtotalCents = subtotal
	resp.DeliveryFeeCents = fee
	resp.TotalCents = subtotal + fee
	resp.DeliverBy = deliverBy

	if req.DryRun {
		return resp, nil
	}

	// 9. write
	err = tx.QueryRow(ctx, `
		INSERT INTO orders (status, box_size, box_design_id, card_design_id, card_text,
			customer_name, customer_phone, recipient_name, recipient_phone, address, lat, lon,
			delivery_type, deliver_by, subtotal_cents, delivery_fee_cents, total_cents,
			bag_color, gift, recipient, occasion, geocoded)
		VALUES ($1::order_status, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
			$13::delivery_type, $14, $15, $16, $17, $18, $19, $20, $21, $22)
		RETURNING id, track_token`,
		status, req.BoxSize, req.BoxDesignID, req.CardDesignID, req.CardText,
		req.CustomerName, req.CustomerPhone, req.RecipientName, req.RecipientPhone,
		req.Address, req.Lat, req.Lon, req.DeliveryType, deliverBy,
		subtotal, fee, subtotal+fee,
		req.BagColor, req.Gift, req.Recipient, req.Occasion, resp.Geocoded).Scan(&resp.ID, &resp.Track)
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
	for id, p := range prints {
		if _, err := tx.Exec(ctx, `
			INSERT INTO order_prints (order_id, product_id, image, image2, caption, body)
			VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6)`,
			resp.ID, id, p.Image, p.Image2, p.Caption, p.Body); err != nil {
			return resp, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return resp, err
	}
	return resp, nil
}

func codeExists(ctx context.Context, tx pgx.Tx, table string, code *string) (bool, error) {
	if code == nil {
		return true, nil
	}
	var ok bool
	err := tx.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM "+table+" WHERE code = $1)", *code).Scan(&ok)
	return ok, err
}

func haversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusKm = 6371.0
	rad := math.Pi / 180
	dLat := (lat2 - lat1) * rad
	dLon := (lon2 - lon1) * rad
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*rad)*math.Cos(lat2*rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
	return 2 * earthRadiusKm * math.Asin(math.Sqrt(a))
}
