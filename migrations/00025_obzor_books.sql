-- +goose Up
-- the book in the catalogue for each character (null until it's there)
ALTER TABLE obzor_items ADD COLUMN product_id BIGINT REFERENCES products(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE obzor_items DROP COLUMN product_id;
