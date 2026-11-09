-- +goose Up
-- where the receipt goes (Точка requires an email)
ALTER TABLE orders ADD COLUMN customer_email TEXT;

-- +goose Down
ALTER TABLE orders DROP COLUMN customer_email;
