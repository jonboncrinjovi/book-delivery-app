-- +goose Up
-- how many orders a day the shop accepts; 0 = no limit
ALTER TABLE settings ADD COLUMN max_orders_day INT NOT NULL DEFAULT 20;

-- +goose Down
ALTER TABLE settings DROP COLUMN max_orders_day;

