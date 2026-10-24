-- +goose Up
-- the fixed list of categories; Postgres rejects anything else
CREATE TYPE product_category AS ENUM ('book', 'drink', 'snack', 'flowers', 'other');

ALTER TABLE books RENAME TO products;
ALTER TABLE products RENAME COLUMN title TO name;
ALTER TABLE products ALTER COLUMN author DROP NOT NULL;          -- cheese has no author
ALTER TABLE products
    ADD COLUMN category product_category NOT NULL DEFAULT 'book', -- existing rows are books
    ADD COLUMN description TEXT NOT NULL DEFAULT '',
    ADD COLUMN slots INTEGER NOT NULL DEFAULT 2 CHECK (slots > 0),  -- space taken in a box
    ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;              -- hide without deleting
ALTER TABLE products ALTER COLUMN category DROP DEFAULT;          -- new rows must state it

CREATE TABLE box_sizes (
    code           TEXT PRIMARY KEY,           -- S, M, L, CUSTOM
    name           TEXT NOT NULL,
    capacity_slots INTEGER,                    -- NULL for custom: you quote by hand
    price_cents    INTEGER NOT NULL CHECK (price_cents >= 0)
);
INSERT INTO box_sizes (code, name, capacity_slots, price_cents) VALUES
    ('S', 'Маленькая', 4, 0),
    ('M', 'Средняя', 8, 0),
    ('L', 'Большая', 12, 0),
    ('CUSTOM', 'Нестандартная', NULL, 0);

CREATE TYPE design_kind AS ENUM ('box_print', 'card');           -- A3 box print or A6 card
CREATE TABLE designs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind        design_kind NOT NULL,
    name        TEXT NOT NULL,
    image_path  TEXT,                         -- NULL for the "upload your own" entry
    is_custom   BOOLEAN NOT NULL DEFAULT false,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    active      BOOLEAN NOT NULL DEFAULT true
);

-- +goose Down
DROP TABLE designs;
DROP TYPE design_kind;
DROP TABLE box_sizes;
ALTER TABLE products DROP COLUMN active, DROP COLUMN slots,
    DROP COLUMN description, DROP COLUMN category;
ALTER TABLE products RENAME COLUMN name TO title;
ALTER TABLE products RENAME TO books;
DROP TYPE product_category;
