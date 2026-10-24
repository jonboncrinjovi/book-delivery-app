-- +goose Up
CREATE TABLE books (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- auto-numbered 1, 2, 3...
    title       TEXT NOT NULL,
    author      TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),        -- money as whole kopecks, never floats
    stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE books;
