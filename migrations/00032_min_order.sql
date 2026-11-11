-- +goose Up
-- the smallest order: money paid for goods, in kopecks (0 switches the rule off)
ALTER TABLE settings ADD COLUMN min_order_cents INT NOT NULL DEFAULT 50000;

-- +goose Down
ALTER TABLE settings DROP COLUMN min_order_cents;
