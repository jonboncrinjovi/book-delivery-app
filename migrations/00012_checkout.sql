-- +goose Up
-- secret link for the tracking page: 32 random hex characters per order
-- (gen_random_uuid is built into Postgres; we strip the dashes)
ALTER TABLE orders
    ADD COLUMN track_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '');

-- blind-date books: the buyer chose not to see the title, so tracking hides it too
ALTER TABLE order_items ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE order_items DROP COLUMN hidden;
ALTER TABLE orders DROP COLUMN track_token;
