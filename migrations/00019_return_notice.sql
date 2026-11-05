-- +goose Up
-- when the return rules were sent to the customer: the proof that keeps the return period at 7 days
ALTER TABLE orders ADD COLUMN return_notice_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE orders DROP COLUMN return_notice_at;
