-- +goose Up
-- who opened the confirmation link, when they confirmed, and the password the courier asks for
ALTER TABLE orders
  ADD COLUMN customer_chat_id BIGINT,
  ADD COLUMN confirmed_at TIMESTAMPTZ,
  ADD COLUMN confirm_word TEXT;

-- +goose Down
ALTER TABLE orders DROP COLUMN confirm_word, DROP COLUMN confirmed_at, DROP COLUMN customer_chat_id;
