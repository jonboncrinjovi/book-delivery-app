package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// one lookup at a time, at most one per second (Nominatim's usage policy),
// and every found address remembered so it's never asked twice
var geo struct {
	sync.Mutex
	last  time.Time
	cache map[string][2]float64
}

// geocode turns a typed address into coordinates, searching only Petersburg and its surroundings
func geocode(ctx context.Context, address string) (lat, lon float64, ok bool) {
	key := strings.ToLower(strings.TrimSpace(address))
	if key == "" {
		return 0, 0, false
	}
	geo.Lock()
	defer geo.Unlock()
	if geo.cache == nil {
		geo.cache = map[string][2]float64{}
	}
	if c, found := geo.cache[key]; found {
		return c[0], c[1], true
	}
	if wait := time.Second - time.Since(geo.last); wait > 0 {
		time.Sleep(wait)
	}
	geo.last = time.Now()

	q := url.Values{
		"q": {address}, "format": {"json"}, "limit": {"1"}, "countrycodes": {"ru"},
		// a box around Petersburg and the nearby region (left lon, top lat, right lon, bottom lat);
		// bounded=1 means results must lie inside it, so "Невский 1" can't land in another city
		"viewbox": {"29.0,60.4,31.6,59.3"}, "bounded": {"1"}, "accept-language": {"ru"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://nominatim.openstreetmap.org/search?"+q.Encode(), nil)
	if err != nil {
		return 0, 0, false
	}
	ua := os.Getenv("WEATHER_UA") // the same identification MET Norway gets
	if ua == "" {
		ua = "knizhki-i-vinishko/1.0"
	}
	req.Header.Set("User-Agent", ua)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, 0, false
	}
	defer resp.Body.Close()

	var found []struct {
		Lat string `json:"lat"`
		Lon string `json:"lon"`
	}
	if json.NewDecoder(resp.Body).Decode(&found) != nil || len(found) == 0 {
		return 0, 0, false
	}
	lat, err1 := strconv.ParseFloat(found[0].Lat, 64)
	lon, err2 := strconv.ParseFloat(found[0].Lon, 64)
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	geo.cache[key] = [2]float64{lat, lon}
	return lat, lon, true
}
