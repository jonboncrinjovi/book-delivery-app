-- +goose Up
CREATE TABLE settings (
    id                       BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),  -- only one row can exist
    delivery_fee_cents       INTEGER NOT NULL,
    free_delivery_from_cents INTEGER,                    -- NULL = never free
    express_fee_cents        INTEGER NOT NULL,
    outside_km_fee_cents     INTEGER NOT NULL,
    city_center_lat          DOUBLE PRECISION NOT NULL,
    city_center_lon          DOUBLE PRECISION NOT NULL,
    city_radius_km           DOUBLE PRECISION NOT NULL,  -- "inside the city"
    max_radius_km            DOUBLE PRECISION NOT NULL,  -- beyond this, no delivery
    order_cutoff_hour        INTEGER NOT NULL,           -- same-day and express until this hour
    deliver_until_hour       INTEGER NOT NULL            -- standard deliveries done by this hour
);
INSERT INTO settings VALUES (true, 29000, 300000, 99000, 5000, 59.9390, 30.3158, 15, 60, 19, 22);

CREATE TYPE order_status AS ENUM
    ('awaiting_quote', 'awaiting_payment', 'paid', 'packing', 'on_the_way', 'delivered', 'cancelled');
CREATE TYPE delivery_type AS ENUM ('standard', 'express');

CREATE TABLE orders (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status             order_status NOT NULL,
    box_size           TEXT NOT NULL REFERENCES box_sizes(code),   -- must be an existing size
    box_design_id      BIGINT REFERENCES designs(id),              -- NULL = plain box
    card_design_id     BIGINT REFERENCES designs(id),              -- NULL = no card
    card_text          TEXT NOT NULL DEFAULT '',
    customer_name      TEXT NOT NULL,
    customer_phone     TEXT NOT NULL,
    recipient_name     TEXT NOT NULL,
    recipient_phone    TEXT NOT NULL,
    address            TEXT NOT NULL,
    lat                DOUBLE PRECISION NOT NULL,
    lon                DOUBLE PRECISION NOT NULL,
    delivery_type      delivery_type NOT NULL,
    deliver_by         TIMESTAMPTZ NOT NULL,
    subtotal_cents     INTEGER NOT NULL,
    delivery_fee_cents INTEGER NOT NULL,
    total_cents        INTEGER NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    order_id         BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,  -- order gone = items gone
    product_id       BIGINT NOT NULL REFERENCES products(id),
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL,       -- price at purchase time, frozen
    PRIMARY KEY (order_id, product_id)       -- each product appears once per order
);

-- +goose Down
DROP TABLE order_items;
DROP TABLE orders;
DROP TYPE delivery_type;
DROP TYPE order_status;
DROP TABLE settings;
