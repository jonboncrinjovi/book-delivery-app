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
	_ "time/tzdata" // bakes timezone data into the binary; the distroless image has none

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
}

// what the customer sends; note: no prices, no totals. The server decides those.
type OrderReq struct {
	BoxSize        string         `json:"box_size"`
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
	ID               int64     `json:"id"`
	Status           string    `json:"status"`
	SubtotalCents    int       `json:"subtotal_cents"`
	DeliveryFeeCents int       `json:"delivery_fee_cents"`
	TotalCents       int       `json:"total_cents"`
	DeliverBy        time.Time `json:"deliver_by"`
}

type settings struct {
	DeliveryFee, ExpressFee, KmFee  int
	FreeFrom                        *int
	CenterLat, CenterLon            float64
	RadiusKm, MaxKm                 float64
	CutoffHour, UntilHour           int
}

// badRequest marks errors caused by the customer's input (answered with 400),
// as opposed to server failures (answered with 500, details hidden)
type badRequest struct{ msg string }

func (e badRequest) Error() string { return e.msg }

func createOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req OrderReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		// "now" is passed in rather than read inside, so the logic can be tested at any time of day
		resp, err := placeOrder(r.Context(), pool, req, time.Now().In(moscow))
		var br badRequest
		switch {
		case errors.As(err, &br):
			http.Error(w, br.msg, http.StatusBadRequest)
		case err != nil:
			http.Error(w, "could not place order", http.StatusInternalServerError)
		default:
			writeJSON(w, http.StatusCreated, resp)
		}
	}
}

func placeOrder(ctx context.Context, pool *pgxpool.Pool, req OrderReq, now time.Time) (OrderResp, error) {
	var resp OrderResp

	// 1. checks that need no database
	if req.CustomerName == "" || req.CustomerPhone == "" || req.RecipientName == "" ||
		req.RecipientPhone == "" || strings.TrimSpace(req.Address) == "" {
		return resp, badRequest{"customer, recipient and address are required"}
	}
	if req.DeliveryType != "standard" && req.DeliveryType != "express" {
		return resp, badRequest{"delivery_type must be standard or express"}
	}
	if len(req.Items) == 0 {
		return resp, badRequest{"the box is empty"}
	}

	// merge duplicates: the same product listed twice becomes one line
	qty := map[int64]int{}
	for _, it := range req.Items {
		if it.Quantity <= 0 {
			return resp, badRequest{"quantities must be positive"}
		}
		qty[it.ProductID] += it.Quantity
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
	defer tx.Rollback(ctx) // undoes everything on any early return; harmless after Commit

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

	// 3. delivery area, checked early so nobody fills a box for an address you don't serve
	dist := haversineKm(s.CenterLat, s.CenterLon, req.Lat, req.Lon)
	if dist > s.MaxKm {
		return resp, badRequest{"address is outside the delivery area"}
	}

	// 4. box
	var capacity *int
	var boxPrice int
	err = tx.QueryRow(ctx, `SELECT capacity_slots, price_cents FROM box_sizes WHERE code = $1`,
		req.BoxSize).Scan(&capacity, &boxPrice)
	if errors.Is(err, pgx.ErrNoRows) {
		return resp, badRequest{"unknown box size"}
	}
	if err != nil {
		return resp, err
	}

	// 5. products: lock each row, check it, price it
	itemsTotal, slots := 0, 0
	prices := map[int64]int{}
	for _, id := range ids {
		var price, stock, sl int
		var active bool
		// FOR UPDATE locks the row until commit: two buyers can't both take the last copy
		err := tx.QueryRow(ctx,
			`SELECT price_cents, stock, slots, active FROM products WHERE id = $1 FOR UPDATE`,
			id).Scan(&price, &stock, &sl, &active)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && !active) {
			return resp, badRequest{fmt.Sprintf("product %d is not available", id)}
		}
		if err != nil {
			return resp, err
		}
		if stock < qty[id] {
			return resp, badRequest{fmt.Sprintf("only %d left of product %d", stock, id)}
		}
		prices[id] = price
		itemsTotal += price * qty[id]
		slots += sl * qty[id]
	}
	if capacity != nil && slots > *capacity {
		return resp, badRequest{fmt.Sprintf("items need %d slots, box %s holds %d", slots, req.BoxSize, *capacity)}
	}

	// 6. designs: must exist, be active, and be the right kind (no A3 print used as a card)
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
			return resp, badRequest{"unknown " + d.kind + " design"}
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
		return resp, badRequest{fmt.Sprintf("express delivery is available until %d:00", s.CutoffHour)}
	case now.Before(cutoff):
		deliverBy = until // today
	default:
		deliverBy = until.AddDate(0, 0, 1) // tomorrow
	}

	status := "awaiting_payment"
	if capacity == nil {
		status = "awaiting_quote" // custom box: you price it by hand before payment
	}

	// 9. write the order, its items, and reduce stock
	err = tx.QueryRow(ctx, `
		INSERT INTO orders (status, box_size, box_design_id, card_design_id, card_text,
			customer_name, customer_phone, recipient_name, recipient_phone, address, lat, lon,
			delivery_type, deliver_by, subtotal_cents, delivery_fee_cents, total_cents)
		VALUES ($1::order_status, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
			$13::delivery_type, $14, $15, $16, $17)
		RETURNING id`,
		status, req.BoxSize, req.BoxDesignID, req.CardDesignID, req.CardText,
		req.CustomerName, req.CustomerPhone, req.RecipientName, req.RecipientPhone,
		req.Address, req.Lat, req.Lon, req.DeliveryType, deliverBy,
		subtotal, fee, subtotal+fee).Scan(&resp.ID)
	if err != nil {
		return resp, err
	}
	for _, id := range ids {
		if _, err := tx.Exec(ctx,
			`INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)`,
			resp.ID, id, qty[id], prices[id]); err != nil {
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

	resp.Status = status
	resp.SubtotalCents = subtotal
	resp.DeliveryFeeCents = fee
	resp.TotalCents = subtotal + fee
	resp.DeliverBy = deliverBy
	return resp, nil
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
