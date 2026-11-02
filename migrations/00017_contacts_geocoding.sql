-- +goose Up
-- remembered for the next order (Telegram gives name and photo, but never the phone)
ALTER TABLE users ADD COLUMN phone TEXT, ADD COLUMN address TEXT;
-- false = the address couldn't be found on the map; the delivery price needs confirming
ALTER TABLE orders ADD COLUMN geocoded BOOLEAN NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE orders DROP COLUMN geocoded;
ALTER TABLE users DROP COLUMN address, DROP COLUMN phone;
