-- +goose Up
-- every Russian word form 4–10 letters long (from OpenCorpora): what counts as a real word
CREATE TABLE bukvin_words (word TEXT PRIMARY KEY);

-- one word a day
CREATE TABLE bukvin_days (
  play_date  DATE PRIMARY KEY,
  word       TEXT NOT NULL CHECK (char_length(word) BETWEEN 4 AND 10),
  base       INT NOT NULL DEFAULT 40 CHECK (base BETWEEN 10 AND 80),
  product_id BIGINT REFERENCES products(id) ON DELETE SET NULL
);

-- one game per person per day
CREATE TABLE bukvin_plays (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  play_date   DATE NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  guesses     TEXT[] NOT NULL DEFAULT '{}',
  finished_at TIMESTAMPTZ,
  solved      BOOLEAN NOT NULL DEFAULT false,
  score       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, play_date)
);

-- all games' scores in one place, for the leaderboard
CREATE VIEW game_scores AS
  SELECT user_id, finished_at, score FROM puzzle_plays
  UNION ALL
  SELECT user_id, finished_at, score FROM bukvin_plays;

-- +goose Down
DROP VIEW game_scores;
DROP TABLE bukvin_plays;
DROP TABLE bukvin_days;
DROP TABLE bukvin_words;
