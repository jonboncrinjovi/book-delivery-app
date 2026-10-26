package main

import (
	"context"
	"crypto/rand"
	"encoding/csv"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

// columns the spreadsheet must have; their order doesn't matter
var columns = []string{"isbn", "name", "author", "description", "price_rub",
	"stock", "slots", "tags", "hints", "hook", "quotes", "cover"}

// one spreadsheet row, parsed and checked
type book struct {
	line                                        int
	isbn, name, author, description, hook, cover string
	priceCents, stock, slots                     int
	tags, hints, quotes                          []string
}

type tag struct {
	id     int64
	parent *int64 // the anchor genre, nil for anchors themselves
}

func main() {
	forceCovers := flag.Bool("covers", false, "regenerate covers even for books that already have one")
	mediaDir := flag.String("media", "media", "folder the API serves images from")
	flag.Parse()
	if flag.NArg() != 1 {
		log.Fatal("usage: go run ./cmd/import [-covers] path/to/books.csv")
	}
	csvPath := flag.Arg(0)

	// 1. read and check the whole file before touching the database
	books, err := readCSV(csvPath)
	if err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close(ctx)

	// 2. check every tag name exists, so a typo like "Фантастка" stops the import
	tags, err := loadTags(ctx, conn)
	if err != nil {
		log.Fatal(err)
	}
	var problems []string
	for _, b := range books {
		for _, name := range b.tags {
			t, ok := tags[name]
			switch {
			case !ok:
				problems = append(problems, fmt.Sprintf("line %d: unknown tag %q", b.line, name))
			case t == nil:
				problems = append(problems, fmt.Sprintf("line %d: tag %q exists under two genres", b.line, name))
			}
		}
	}
	if len(problems) > 0 {
		log.Fatal("nothing imported:\n" + strings.Join(problems, "\n"))
	}

	// 3. write everything in one transaction: all books or none
	tx, err := conn.Begin(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer tx.Rollback(ctx)

	created, updated, covers := 0, 0, 0
	for _, b := range books {
		var id int64
		var inserted, hasCover bool
		// ON CONFLICT: if this ISBN exists, update that row instead of failing.
		// (xmax = 0) is a Postgres trick: true when the row was just inserted, false when updated.
		err := tx.QueryRow(ctx, `
			INSERT INTO products (isbn, category, name, author, description,
				price_cents, stock, slots, hook, hints)
			VALUES ($1, 'book', $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (isbn) DO UPDATE SET
				name = EXCLUDED.name, author = EXCLUDED.author,
				description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
				stock = EXCLUDED.stock, slots = EXCLUDED.slots,
				hook = EXCLUDED.hook, hints = EXCLUDED.hints
			RETURNING id, (xmax = 0), cover_path IS NOT NULL`,
			b.isbn, b.name, b.author, b.description, b.priceCents,
			b.stock, b.slots, b.hook, b.hints,
		).Scan(&id, &inserted, &hasCover)
		if err != nil {
			log.Fatalf("line %d: %v", b.line, err)
		}
		if inserted {
			created++
		} else {
			updated++
		}

		// tags and quotes: replace whatever the book had with what the spreadsheet says
		if _, err := tx.Exec(ctx, `DELETE FROM book_tags WHERE product_id = $1`, id); err != nil {
			log.Fatal(err)
		}
		for _, name := range b.tags {
			t := tags[name]
			ids := []int64{t.id}
			if t.parent != nil {
				ids = append(ids, *t.parent) // a subtag brings its anchor genre along
			}
			for _, tagID := range ids {
				if _, err := tx.Exec(ctx, `
					INSERT INTO book_tags (product_id, tag_id) VALUES ($1, $2)
					ON CONFLICT DO NOTHING`, id, tagID); err != nil {
					log.Fatal(err)
				}
			}
		}
		if _, err := tx.Exec(ctx, `DELETE FROM book_quotes WHERE product_id = $1`, id); err != nil {
			log.Fatal(err)
		}
		for _, q := range b.quotes {
			if _, err := tx.Exec(ctx,
				`INSERT INTO book_quotes (product_id, text) VALUES ($1, $2)`, id, q); err != nil {
				log.Fatal(err)
			}
		}

		// covers: only for books without one, unless -covers was given
		if b.cover != "" && (!hasCover || *forceCovers) {
			src := filepath.Join(filepath.Dir(csvPath), b.cover) // cover files sit next to the CSV
			cover, blur, err := makeCovers(src, *mediaDir)
			if err != nil {
				log.Fatalf("line %d: %v", b.line, err)
			}
			if _, err := tx.Exec(ctx,
				`UPDATE products SET cover_path = $1, cover_blur_path = $2 WHERE id = $3`,
				cover, blur, id); err != nil {
				log.Fatal(err)
			}
			covers++
		}
	}

	if err := tx.Commit(ctx); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("done: %d new, %d updated, %d covers made\n", created, updated, covers)
}

func readCSV(path string) ([]book, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	// Excel starts UTF-8 files with an invisible marker (BOM) that would corrupt the first header name
	text := strings.TrimPrefix(string(data), "\ufeff")

	r := csv.NewReader(strings.NewReader(text))
	r.FieldsPerRecord = -1 // tolerate rows with missing trailing cells
	// Russian-locale Excel separates columns with ";" instead of ","
	firstLine, _, _ := strings.Cut(text, "\n")
	if strings.Count(firstLine, ";") > strings.Count(firstLine, ",") {
		r.Comma = ';'
	}
	rows, err := r.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(rows) < 2 {
		return nil, fmt.Errorf("%s has no books", path)
	}

	// map each header name to its column position
	idx := map[string]int{}
	for i, h := range rows[0] {
		idx[strings.ToLower(strings.TrimSpace(h))] = i
	}
	for _, c := range columns {
		if _, ok := idx[c]; !ok {
			return nil, fmt.Errorf("missing column %q", c)
		}
	}

	var books []book
	var problems []string
	seen := map[string]int{} // isbn → line, to catch the same book twice in one file
	for n, row := range rows[1:] {
		line := n + 2 // +1 for the header row, +1 because spreadsheets count from 1
		get := func(col string) string {
			if i := idx[col]; i < len(row) {
				return strings.TrimSpace(row[i])
			}
			return ""
		}
		b := book{
			line: line, isbn: get("isbn"), name: get("name"), author: get("author"),
			description: get("description"), hook: get("hook"), cover: get("cover"),
			tags: splitList(get("tags")), hints: splitList(get("hints")), quotes: splitList(get("quotes")),
		}
		if b.isbn == "" && b.name == "" {
			continue // empty row
		}
		bad := func(msg string) { problems = append(problems, fmt.Sprintf("line %d: %s", line, msg)) }

		if b.isbn == "" || b.name == "" || b.author == "" {
			bad("isbn, name and author are required")
		}
		if prev, dup := seen[b.isbn]; dup && b.isbn != "" {
			bad(fmt.Sprintf("same isbn as line %d", prev))
		}
		seen[b.isbn] = line

		// "599,50" or "599.50" → 59950 kopecks
		price, err := strconv.ParseFloat(strings.ReplaceAll(get("price_rub"), ",", "."), 64)
		if err != nil || price < 0 {
			bad("price_rub must be a number >= 0")
		}
		b.priceCents = int(math.Round(price * 100))

		if b.stock, err = strconv.Atoi(get("stock")); err != nil || b.stock < 0 {
			bad("stock must be a whole number >= 0")
		}
		b.slots = 2 // default: a typical book
		if s := get("slots"); s != "" {
			if b.slots, err = strconv.Atoi(s); err != nil || b.slots <= 0 {
				bad("slots must be a whole number > 0")
			}
		}
		for _, q := range b.quotes {
			if len([]rune(q)) > 300 { // count characters, not bytes: Cyrillic letters take 2 bytes each
				bad("a quote is longer than 300 characters")
			}
		}
		if b.cover != "" {
			if _, err := os.Stat(filepath.Join(filepath.Dir(path), b.cover)); err != nil {
				bad(fmt.Sprintf("cover file %q not found next to the CSV", b.cover))
			}
		}
		books = append(books, b)
	}
	if len(problems) > 0 {
		return nil, fmt.Errorf("nothing imported:\n%s", strings.Join(problems, "\n"))
	}
	return books, nil
}

// splitList turns "a | b | c" into [a b c]; always non-nil, since pgx sends nil as NULL
func splitList(s string) []string {
	out := []string{}
	for _, part := range strings.Split(s, "|") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// loadTags maps tag names to ids; a name used under two genres maps to nil (ambiguous)
func loadTags(ctx context.Context, conn *pgx.Conn) (map[string]*tag, error) {
	rows, err := conn.Query(ctx, `SELECT id, name, parent_id FROM tags`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tags := map[string]*tag{}
	for rows.Next() {
		var t tag
		var name string
		if err := rows.Scan(&t.id, &name, &t.parent); err != nil {
			return nil, err
		}
		if _, exists := tags[name]; exists {
			tags[name] = nil
		} else {
			tags[name] = &t
		}
	}
	return tags, rows.Err()
}

// makeCovers writes the real cover and a blurred copy under unrelated random names
func makeCovers(src, mediaDir string) (cover, blur string, err error) {
	cover = "covers/" + randomName() + ".jpg"
	blur = "blur/" + randomName() + ".jpg"
	if err = run("convert", src, "-resize", "400x", filepath.Join(mediaDir, cover)); err != nil {
		return "", "", err
	}
	if err = run("convert", src, "-resize", "400x", "-scale", "6%", "-scale", "400x",
		"-blur", "0x6", filepath.Join(mediaDir, blur)); err != nil {
		return "", "", err
	}
	return cover, blur, nil
}

// run executes an outside program (here ImageMagick) and reports its output if it fails
func run(name string, args ...string) error {
	out, err := exec.Command(name, args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s failed: %v: %s", name, err, out)
	}
	return nil
}

func randomName() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b) // 8 random bytes → 16 hex characters
}
