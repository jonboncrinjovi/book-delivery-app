-- +goose Up
-- the payment link for each order, and when it was paid
ALTER TABLE orders
  ADD COLUMN payment_id         TEXT,
  ADD COLUMN payment_link       TEXT,
  ADD COLUMN payment_created_at TIMESTAMPTZ,
  ADD COLUMN paid_at            TIMESTAMPTZ;

-- the switch, and the receipt's tax settings (set from the accountant before switching on)
ALTER TABLE settings
  ADD COLUMN payments_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN tax_system       TEXT NOT NULL DEFAULT 'usn_income',
  ADD COLUMN vat_type         TEXT NOT NULL DEFAULT 'none';

-- +goose Down
ALTER TABLE settings DROP COLUMN payments_enabled, DROP COLUMN tax_system, DROP COLUMN vat_type;
ALTER TABLE orders DROP COLUMN payment_id, DROP COLUMN payment_link, DROP COLUMN payment_created_at, DROP COLUMN paid_at;
