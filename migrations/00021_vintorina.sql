-- +goose Up
-- the puzzles: three a day; the answers stay on the server, "text|other:0.8|…"
CREATE TABLE puzzles (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  play_date  DATE NOT NULL,
  slot       SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 3),
  image      TEXT NOT NULL,
  line       TEXT NOT NULL,
  hint       TEXT NOT NULL DEFAULT '',
  answers    TEXT NOT NULL,
  base       INT NOT NULL CHECK (base BETWEEN 10 AND 60),
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
  UNIQUE (play_date, slot)
);

-- one play per person per puzzle; the clock is the server's
CREATE TABLE puzzle_plays (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id   BIGINT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  hint_used   BOOLEAN NOT NULL DEFAULT false,
  guesses     SMALLINT NOT NULL DEFAULT 0,
  finished_at TIMESTAMPTZ,
  score       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, puzzle_id)
);
CREATE INDEX puzzle_plays_finished ON puzzle_plays (finished_at);

-- the leaderboard name, shown only to those who agreed
ALTER TABLE users ADD COLUMN nickname TEXT UNIQUE, ADD COLUMN show_in_top BOOLEAN NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE users DROP COLUMN show_in_top, DROP COLUMN nickname;
DROP TABLE puzzle_plays;
DROP TABLE puzzles;
