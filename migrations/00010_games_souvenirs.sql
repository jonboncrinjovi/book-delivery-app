-- +goose Up
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'games';
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'souvenirs';

-- +goose Down
-- Postgres can't remove enum values, so there is nothing to undo
SELECT 1;
