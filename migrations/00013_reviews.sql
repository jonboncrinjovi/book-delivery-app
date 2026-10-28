-- +goose Up
CREATE TYPE review_status AS ENUM ('pending', 'published', 'rejected');

CREATE TABLE reviews (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    text         TEXT NOT NULL CHECK (char_length(text) BETWEEN 10 AND 200),
    spoiler      BOOLEAN NOT NULL DEFAULT false,  -- set by you when moderating: never shown in blind mode
    status       review_status NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    UNIQUE (user_id, product_id)                  -- one review per book per person
);

-- grape ratings of reviews: 1 = Лист ... 5 = Гроздь; one vote per person per review, changeable
CREATE TABLE review_votes (
    review_id BIGINT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grapes    SMALLINT NOT NULL CHECK (grapes BETWEEN 1 AND 5),
    PRIMARY KEY (review_id, user_id)
);

-- the gold plaque's thresholds, adjustable without touching code
ALTER TABLE settings
    ADD COLUMN plaque_min_avg   NUMERIC(3,2) NOT NULL DEFAULT 4.5,
    ADD COLUMN plaque_min_votes INTEGER NOT NULL DEFAULT 10;

-- +goose Down
ALTER TABLE settings DROP COLUMN plaque_min_votes, DROP COLUMN plaque_min_avg;
DROP TABLE review_votes;
DROP TABLE reviews;
DROP TYPE review_status;
