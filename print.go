package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-pdf/fpdf"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const printsDir = "/prints"

var uploadIDRe = regexp.MustCompile(`^[0-9a-f]{32}$`)

// what the customer designed: pictures are upload ids
type PrintReq struct {
	Image   string `json:"image"`
	Image2  string `json:"image2"`
	Caption string `json:"caption"`
	Body    string `json:"body"`
}

func uploadPath(id string) string { return filepath.Join(printsDir, "uploads", id+".jpg") }

// card size → the sheet it's printed on, opened flat (mm, landscape)
var sheetSize = map[string][2]float64{"A6": {210, 148}, "A5": {297, 210}, "A4": {420, 297}}
var sheetName = map[string]string{"A6": "лист A5", "A5": "лист A4", "A4": "лист A3"}

// POST /api/uploads (logged in): one picture, re-encoded as JPEG on white, at most 4000 px on the long side
func uploadImage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if userID(r.Context(), pool, r) == 0 {
			http.Error(w, "Войдите через Telegram", http.StatusUnauthorized)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 25<<20)
		file, _, err := r.FormFile("image")
		if err != nil {
			http.Error(w, "Файл не получен или он больше 25 МБ", http.StatusBadRequest)
			return
		}
		defer file.Close()
		img, _, err := image.Decode(file)
		if err != nil {
			http.Error(w, "Поддерживаются картинки JPEG, PNG и WebP", http.StatusBadRequest)
			return
		}
		b := img.Bounds()
		if b.Dx() < 600 || b.Dy() < 600 {
			http.Error(w, "Картинка слишком маленькая для печати: нужно хотя бы 600×600 точек", http.StatusBadRequest)
			return
		}
		// white background (transparent PNG areas would otherwise print black), then shrink if needed
		const maxSide = 4000
		wd, ht := b.Dx(), b.Dy()
		if long := max(wd, ht); long > maxSide {
			wd, ht = wd*maxSide/long, ht*maxSide/long
		}
		dst := image.NewRGBA(image.Rect(0, 0, wd, ht))
		draw.Draw(dst, dst.Bounds(), image.White, image.Point{}, draw.Src)
		if wd == b.Dx() {
			draw.Draw(dst, dst.Bounds(), img, b.Min, draw.Over)
		} else {
			draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)
		}

		raw := make([]byte, 16)
		rand.Read(raw)
		id := hex.EncodeToString(raw)
		f, err := os.Create(uploadPath(id))
		if err != nil {
			log.Printf("upload: %v", err)
			http.Error(w, "Не получилось сохранить картинку", http.StatusInternalServerError)
			return
		}
		err = jpeg.Encode(f, dst, &jpeg.Options{Quality: 92})
		f.Close()
		if err == nil {
			_, err = pool.Exec(r.Context(), `INSERT INTO uploads (id, user_id) VALUES ($1, $2)`, id, userID(r.Context(), pool, r))
		}
		if err != nil {
			os.Remove(uploadPath(id))
			log.Printf("upload: %v", err)
			http.Error(w, "Не получилось сохранить картинку", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": id})
	}
}

// GET /api/uploads/{id}: the ids are random 128-bit, so knowing one is the permission
func serveUpload() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !uploadIDRe.MatchString(id) {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "private, max-age=86400")
		http.ServeFile(w, r, uploadPath(id))
	}
}

type PrintProduct struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	PriceCents int    `json:"price_cents"`
	Kind       string `json:"print_kind"`
	Size       string `json:"print_size"`
}

// GET /api/prints: the printable products with their current prices
func listPrintProducts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out := []PrintProduct{}
		rows, err := pool.Query(r.Context(), `
			SELECT id, name, price_cents, print_kind, print_size FROM products
			WHERE print_kind IS NOT NULL AND active ORDER BY price_cents`)
		if err != nil {
			http.Error(w, "Ошибка", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var p PrintProduct
			if rows.Scan(&p.ID, &p.Name, &p.PriceCents, &p.Kind, &p.Size) == nil {
				out = append(out, p)
			}
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// checkPrint validates a design inside the order transaction
func checkPrint(ctx context.Context, tx pgx.Tx, kind string, p *PrintReq) error {
	if p == nil {
		return badRequest{"Для открытки или упаковки нужен макет"}
	}
	p.Caption, p.Body = strings.TrimSpace(p.Caption), strings.TrimSpace(p.Body)
	if utf8.RuneCountInString(p.Caption) > 80 {
		return badRequest{"Подпись — не больше 80 знаков"}
	}
	if utf8.RuneCountInString(p.Body) > 600 {
		return badRequest{"Текст открытки — не больше 600 знаков"}
	}
	switch kind {
	case "card":
		if p.Image == "" {
			return badRequest{"Для открытки нужна картинка на лицевой стороне"}
		}
	case "wrap":
		p.Image2, p.Body = "", ""
		if p.Image == "" && p.Caption == "" {
			return badRequest{"Для упаковки нужна картинка или надпись"}
		}
	}
	for _, id := range []string{p.Image, p.Image2} {
		if id == "" {
			continue
		}
		var ok bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM uploads WHERE id = $1)`, id).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return badRequest{"Картинка не найдена, загрузите её ещё раз"}
		}
	}
	return nil
}

// makePrints builds the PDFs for an order and sends them to the owner in Telegram
func makePrints(pool *pgxpool.Pool, orderID int64) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	rows, err := pool.Query(ctx, `
		SELECT op.id, p.print_kind, p.print_size, coalesce(op.image, ''), coalesce(op.image2, ''), op.caption, op.body
		FROM order_prints op JOIN products p ON p.id = op.product_id
		WHERE op.order_id = $1`, orderID)
	if err != nil {
		log.Printf("prints: order %d: %v", orderID, err)
		return
	}
	type job struct {
		id         int64
		kind, size string
		p          PrintReq
	}
	var jobs []job
	for rows.Next() {
		var j job
		if rows.Scan(&j.id, &j.kind, &j.size, &j.p.Image, &j.p.Image2, &j.p.Caption, &j.p.Body) == nil {
			jobs = append(jobs, j)
		}
	}
	rows.Close()

	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	owner, _ := strconv.ParseInt(os.Getenv("TELEGRAM_CHAT_ID"), 10, 64)
	for _, j := range jobs {
		out := filepath.Join(printsDir, "pdf", fmt.Sprintf("order-%d-%d.pdf", orderID, j.id))
		var note string
		if j.kind == "card" {
			err = cardPDF(out, j.size, j.p)
			note = fmt.Sprintf("открытка %s: %s, альбомная, двусторонняя печать с переворотом по короткому краю, масштаб 100%%", j.size, sheetName[j.size])
		} else {
			err = wrapPDF(out, j.p)
			note = "упаковка для цветов: лист A3, книжная, масштаб 100%"
		}
		if err != nil {
			log.Printf("prints: order %d print %d: %v", orderID, j.id, err)
			continue
		}
		pool.Exec(ctx, `UPDATE order_prints SET pdf = $1 WHERE id = $2`, out, j.id)
		if token != "" && owner != 0 {
			if err := tgSendFile(ctx, token, owner, out, fmt.Sprintf("Заказ №%d · %s", orderID, note)); err != nil {
				log.Printf("prints: send %d: %v", j.id, err)
			}
		}
	}
}

func newPDF(w, h float64) *fpdf.Fpdf {
	pdf := fpdf.NewCustom(&fpdf.InitType{OrientationStr: "P", UnitStr: "mm", Size: fpdf.SizeType{Wd: w, Ht: h}})
	pdf.SetMargins(0, 0, 0)
	pdf.SetAutoPageBreak(false, 0)
	pdf.AddUTF8Font("serif", "", filepath.Join(printsDir, "fonts", "PT_Serif-Web-Regular.ttf"))
	pdf.AddUTF8Font("serif", "I", filepath.Join(printsDir, "fonts", "PT_Serif-Web-Italic.ttf"))
	return pdf
}

// drawCover places a picture so it fills the box, centred (the caller clips the overflow)
func drawCover(pdf *fpdf.Fpdf, path string, x, y, w, h float64) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	cfg, _, err := image.DecodeConfig(f)
	f.Close()
	if err != nil {
		return err
	}
	iw, ih := float64(cfg.Width), float64(cfg.Height)
	s := max(w/iw, h/ih)
	dw, dh := iw*s, ih*s
	pdf.ImageOptions(path, x+(w-dw)/2, y+(h-dh)/2, dw, dh, false, fpdf.ImageOptions{ImageType: "JPG"}, 0, "")
	return pdf.Error()
}

func coverRect(pdf *fpdf.Fpdf, path string, x, y, w, h float64) error {
	pdf.ClipRect(x, y, w, h, false)
	err := drawCover(pdf, path, x, y, w, h)
	pdf.ClipEnd()
	return err
}

// fitText centres text in a box, shrinking the font until it fits
func fitText(pdf *fpdf.Fpdf, text string, x, y, w, h, maxPt float64, style string) {
	if strings.TrimSpace(text) == "" {
		return
	}
	for size := maxPt; ; size-- {
		pdf.SetFont("serif", style, size)
		lh := size * 0.3528 * 1.3 // points → mm, with line spacing
		var lines []string
		for _, para := range strings.Split(text, "\n") {
			if strings.TrimSpace(para) == "" {
				lines = append(lines, "")
				continue
			}
			lines = append(lines, pdf.SplitText(para, w)...)
		}
		total := float64(len(lines)) * lh
		if total <= h || size <= 7 {
			top := y + max(0, (h-total)/2)
			for i, l := range lines {
				pdf.SetXY(x, top+float64(i)*lh)
				pdf.CellFormat(w, lh, l, "", 0, "C", false, 0, "")
			}
			return
		}
	}
}

func foldMarks(pdf *fpdf.Fpdf, w, h float64) {
	pdf.SetDrawColor(160, 160, 160)
	pdf.SetLineWidth(0.2)
	pdf.Line(w/2, 1, w/2, 4)
	pdf.Line(w/2, h-4, w/2, h-1)
}

// cardPDF: page 1 = outside (back | front), page 2 = inside (picture | text)
func cardPDF(out, size string, p PrintReq) error {
	dims, ok := sheetSize[size]
	if !ok {
		return fmt.Errorf("unknown card size %q", size)
	}
	W, H := dims[0], dims[1]
	pw, m := W/2, 6.0
	k := pw / 105 // text scale: 1 for the small card
	pdf := newPDF(W, H)
	pdf.SetTextColor(40, 30, 30)

	pdf.AddPage()
	lw := pw * 0.3
	pdf.ImageOptions(filepath.Join(printsDir, "logo.png"), (pw-lw)/2, H*0.6, lw, 0, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")
	pdf.SetFont("serif", "", 8*k)
	pdf.SetXY(0, H*0.6+lw+2*k)
	pdf.CellFormat(pw, 5*k, "literalwine.ru · t.me/literalwine", "", 0, "C", false, 0, "")
	capH := 0.0
	if p.Caption != "" {
		capH = H * 0.15
	}
	if err := coverRect(pdf, uploadPath(p.Image), pw+m, m, pw-2*m, H-2*m-capH); err != nil {
		return err
	}
	if capH > 0 {
		fitText(pdf, p.Caption, pw+m, H-m-capH, pw-2*m, capH, 16*k, "")
	}
	foldMarks(pdf, W, H)

	pdf.AddPage()
	if p.Image2 != "" {
		if err := coverRect(pdf, uploadPath(p.Image2), m, m, pw-2*m, H-2*m); err != nil {
			return err
		}
	}
	fitText(pdf, p.Body, pw+2*m, 2*m, pw-4*m, H-4*m, 15*k, "I")
	foldMarks(pdf, W, H)
	return pdf.OutputFileAndClose(out)
}

// wrapPDF: an A3 sheet, round photos alternating with the phrase at an angle
func wrapPDF(out string, p PrintReq) error {
	W, H := 297.0, 420.0
	pdf := newPDF(W, H)
	pdf.AddPage()
	pdf.SetTextColor(87, 3, 13)
	cols, rows := 3, 5
	cw, ch := W/float64(cols), H/float64(rows)
	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {
			cx, cy := cw*(float64(c)+0.5), ch*(float64(r)+0.5)
			if p.Image != "" && (p.Caption == "" || (r+c)%2 == 0) {
				rad := min(cw, ch) * 0.36
				pdf.ClipCircle(cx, cy, rad, false)
				err := drawCover(pdf, uploadPath(p.Image), cx-rad, cy-rad, 2*rad, 2*rad)
				pdf.ClipEnd()
				if err != nil {
					return err
				}
			} else if p.Caption != "" {
				pdf.TransformBegin()
				pdf.TransformRotate(15, cx, cy)
				fitText(pdf, p.Caption, cx-cw*0.45, cy-ch*0.3, cw*0.9, ch*0.6, 22, "I")
				pdf.TransformEnd()
			}
		}
	}
	return pdf.OutputFileAndClose(out)
}

// tgSendFile sends a document to a chat (sendDocument needs a multipart upload)
func tgSendFile(ctx context.Context, token string, chat int64, path, caption string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	mw.WriteField("chat_id", strconv.FormatInt(chat, 10))
	mw.WriteField("caption", caption)
	part, err := mw.CreateFormFile("document", filepath.Base(path))
	if err != nil {
		return err
	}
	if _, err := io.Copy(part, f); err != nil {
		return err
	}
	mw.Close()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.telegram.org/bot"+token+"/sendDocument", &body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("telegram sendDocument: request failed") // the URL holds the token: never log it
	}
	defer resp.Body.Close()
	var env struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return err
	}
	if !env.OK {
		return fmt.Errorf("telegram sendDocument: %s", env.Description)
	}
	return nil
}

// cleanupPrints, once a day: uploads and PDFs older than 90 days are deleted (as the privacy policy says)
func cleanupPrints(pool *pgxpool.Pool) {
	for {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		if rows, err := pool.Query(ctx, `DELETE FROM uploads WHERE created_at < now() - interval '90 days' RETURNING id`); err == nil {
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					os.Remove(uploadPath(id))
				}
			}
			rows.Close()
		}
		if rows, err := pool.Query(ctx, `
			WITH old AS (SELECT id, pdf FROM order_prints WHERE pdf IS NOT NULL AND created_at < now() - interval '90 days')
			UPDATE order_prints op SET pdf = NULL FROM old WHERE op.id = old.id RETURNING old.pdf`); err == nil {
			for rows.Next() {
				var path string
				if rows.Scan(&path) == nil {
					os.Remove(path)
				}
			}
			rows.Close()
		}
		cancel()
		time.Sleep(24 * time.Hour)
	}
}
