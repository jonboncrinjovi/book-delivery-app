-- +goose Up
-- one row per status change: what happened to which order, and when
CREATE TABLE order_events (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status   order_status NOT NULL,
    at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON order_events (order_id);   -- fast lookup of one order's history

-- +goose Down
DROP TABLE order_events;
