package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Today struct {
	Greeting string `json:"greeting"` // "Доброе утро" … "Доброй ночи", by Petersburg time
	Weekday  string `json:"weekday"`
	TempC    *int   `json:"temp_c"`   // null when the weather service didn't answer
	Sky      string `json:"sky"`      // "дождь", "ясно", …; empty when unknown
	Fact     string `json:"fact"`     // "ровно 205 лет назад родился …"; empty when nothing is recorded
}

var weekdays = [...]string{"воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"}

// the weather cache. MET Norway's terms: identify yourself, and don't re-fetch more often than needed.
// sync.Mutex makes sure two simultaneous visitors don't both trigger a fetch.
var weather struct {
	sync.Mutex
	fetched time.Time
	temp    *int
	sky     string
}

func fetchWeather(ctx context.Context) (*int, string) {
	weather.Lock()
	defer weather.Unlock()
	if time.Since(weather.fetched) < 30*time.Minute {
		return weather.temp, weather.sky
	}
	weather.fetched = time.Now() // set even if the fetch fails, so a broken service isn't hammered

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=59.94&lon=30.32", nil) // central Petersburg
	if err != nil {
		return weather.temp, weather.sky
	}
	// MET requires a User-Agent that names the app and how to reach its owner
	ua := os.Getenv("WEATHER_UA")
	if ua == "" {
		ua = "knizhki-i-vinishko/1.0"
	}
	req.Header.Set("User-Agent", ua)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return weather.temp, weather.sky
	}
	defer resp.Body.Close()

	// only the fields we need from MET's large answer
	var data struct {
		Properties struct {
			Timeseries []struct {
				Data struct {
					Instant struct {
						Details struct {
							AirTemperature float64 `json:"air_temperature"`
						} `json:"details"`
					} `json:"instant"`
					Next1h *struct {
						Summary struct {
							SymbolCode string `json:"symbol_code"`
						} `json:"summary"`
					} `json:"next_1_hours"`
				} `json:"data"`
			} `json:"timeseries"`
		} `json:"properties"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || len(data.Properties.Timeseries) == 0 {
		return weather.temp, weather.sky
	}
	now := data.Properties.Timeseries[0].Data // the first entry is the current hour
	t := int(math.Round(now.Instant.Details.AirTemperature))
	weather.temp = &t
	if now.Next1h != nil {
		weather.sky = skyWords(now.Next1h.Summary.SymbolCode)
	}
	return weather.temp, weather.sky
}

// skyWords turns MET's codes ("lightrain_showers_day", "partlycloudy_night", …) into plain Russian
func skyWords(code string) string {
	switch {
	case strings.Contains(code, "thunder"):
		return "гроза"
	case strings.Contains(code, "sleet"):
		return "мокрый снег"
	case strings.Contains(code, "snow"):
		return "снег"
	case strings.Contains(code, "rain"):
		return "дождь"
	case strings.Contains(code, "fog"):
		return "туман"
	case strings.HasPrefix(code, "partlycloudy"): // before "cloudy", which it also contains
		return "переменная облачность"
	case strings.HasPrefix(code, "cloudy"):
		return "пасмурно"
	case strings.HasPrefix(code, "fair"):
		return "почти ясно"
	case strings.HasPrefix(code, "clearsky"):
		return "ясно"
	}
	return ""
}

// yearsWord: Russian plural for "год": 1 год, 2 года, 5 лет, 11 лет, 21 год …
func yearsWord(n int) string {
	switch {
	case n%10 == 1 && n%100 != 11:
		return "год"
	case n%10 >= 2 && n%10 <= 4 && (n%100 < 12 || n%100 > 14):
		return "года"
	}
	return "лет"
}

// today: GET /api/today, everything the butler's small talk needs
func today(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		now := time.Now().In(moscow)
		t := Today{Weekday: weekdays[now.Weekday()]}
		switch h := now.Hour(); {
		case h >= 5 && h < 11:
			t.Greeting = "Доброе утро"
		case h >= 11 && h < 17:
			t.Greeting = "Добрый день"
		case h >= 17 && h < 23:
			t.Greeting = "Добрый вечер"
		default:
			t.Greeting = "Доброй ночи"
		}

		// never keep the visitor waiting long for the weather
		ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
		defer cancel()
		t.TempC, t.Sky = fetchWeather(ctx)

		var year int
		var text string
		if err := pool.QueryRow(ctx, `
			SELECT year, text FROM literary_days WHERE month = $1 AND day = $2
			ORDER BY random() LIMIT 1`, int(now.Month()), now.Day()).Scan(&year, &text); err == nil {
			n := now.Year() - year
			t.Fact = fmt.Sprintf("ровно %d %s назад %s", n, yearsWord(n), text)
		}
		writeJSON(w, http.StatusOK, t)
	}
}
