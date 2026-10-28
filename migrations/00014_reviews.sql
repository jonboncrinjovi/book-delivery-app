-- +goose Up
-- reviews of the service itself: one per delivered order, rated by the customer
CREATE TABLE service_reviews (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id     BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE, -- UNIQUE: one per order
    grapes       SMALLINT NOT NULL CHECK (grapes BETWEEN 1 AND 5),
    text         TEXT NOT NULL CHECK (char_length(text) BETWEEN 10 AND 300),
    status       review_status NOT NULL DEFAULT 'pending',  -- the same three states as book reviews
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

-- +goose Down
DROP TABLE service_reviews;
