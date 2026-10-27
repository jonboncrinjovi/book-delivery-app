-- +goose Up
CREATE TABLE users (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_id  BIGINT UNIQUE,                 -- nullable: later logins (email, VK) won't have one
    display_name TEXT NOT NULL,
    username     TEXT,                          -- Telegram @username, if they have one
    photo_url    TEXT,
    about        TEXT NOT NULL DEFAULT '' CHECK (length(about) <= 200),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one row per logged-in browser; only a hash of the cookie's token is stored
CREATE TABLE sessions (
    token_hash BYTEA PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- taste profile: tags someone loves, and tags never to suggest
CREATE TABLE user_tags (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag_id  BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    kind    TEXT NOT NULL CHECK (kind IN ('favorite', 'blocked')),
    PRIMARY KEY (user_id, tag_id)
);

-- the reading list; points at catalogue products for now,
-- Artamone will later move this onto "works" (books we don't necessarily sell)
CREATE TABLE book_reads (
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    source     TEXT NOT NULL CHECK (source IN ('self', 'purchase')),
    confirmed  BOOLEAN NOT NULL DEFAULT false,  -- set by the future quiz
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

-- orders remember who placed them; deleting a user keeps the order (SET NULL)
ALTER TABLE orders ADD COLUMN user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE orders DROP COLUMN user_id;
DROP TABLE book_reads;
DROP TABLE user_tags;
DROP TABLE sessions;
DROP TABLE users;
