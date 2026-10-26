-- +goose Up
-- UNIQUE still allows many NULLs, so drinks and cheese simply have no ISBN
ALTER TABLE products ADD COLUMN isbn TEXT UNIQUE;

-- +goose Down
ALTER TABLE products DROP COLUMN isbn;
