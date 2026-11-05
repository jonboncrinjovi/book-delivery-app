-- +goose Up
-- uploaded pictures: the file is /prints/uploads/<id>.jpg
CREATE TABLE uploads (
  id         TEXT PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- a product that is printed to order: 'card' (A6/A5/A4) or 'wrap' (A3)
ALTER TABLE products ADD COLUMN print_kind TEXT, ADD COLUMN print_size TEXT;

-- what to print for an order
CREATE TABLE order_prints (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  image      TEXT,
  image2     TEXT,
  caption    TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  pdf        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- starting prices, change them any time
INSERT INTO products (name, price_cents, stock, category, description, slots, print_kind, print_size) VALUES
  ('Своя открытка, маленькая (A6)', 20000, 1000000, 'stationery', 'Открытка 10,5×14,8 см с вашей картинкой и текстом', 1, 'card', 'A6'),
  ('Своя открытка, средняя (A5)',   30000, 1000000, 'stationery', 'Открытка 14,8×21 см с вашей картинкой и текстом',   1, 'card', 'A5'),
  ('Своя открытка, большая (A4)',   45000, 1000000, 'stationery', 'Открытка 21×29,7 см с вашей картинкой и текстом',   1, 'card', 'A4'),
  ('Своя упаковка для цветов (A3)', 25000, 1000000, 'stationery', 'Лист A3 с вашей картинкой и надписью',             1, 'wrap', 'A3');

-- +goose Down
DROP TABLE order_prints;
DELETE FROM products WHERE print_kind IS NOT NULL;
ALTER TABLE products DROP COLUMN print_size, DROP COLUMN print_kind;
DROP TABLE uploads;
