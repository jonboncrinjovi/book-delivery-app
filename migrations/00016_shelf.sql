-- +goose Up
-- books a reader kept with ♥; hidden = kept without opening (a parcel on the shelf)
CREATE TABLE shelf (
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    hidden     BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

-- +goose Down
DROP TABLE shelf;
