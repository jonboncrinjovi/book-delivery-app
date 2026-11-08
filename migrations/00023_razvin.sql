-- +goose Up
-- one tap per person per day; the prize is drawn on the server at the moment of the tap
CREATE TABLE razvin_plays (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  play_date   DATE NOT NULL,
  tile        SMALLINT NOT NULL CHECK (tile BETWEEN 0 AND 47),
  prize       TEXT NOT NULL,
  score       INT NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, play_date)
);

-- the leaderboard now counts all three games
CREATE OR REPLACE VIEW game_scores AS
  SELECT user_id, finished_at, score FROM puzzle_plays
  UNION ALL
  SELECT user_id, finished_at, score FROM bukvin_plays
  UNION ALL
  SELECT user_id, finished_at, score FROM razvin_plays;

-- +goose Down
CREATE OR REPLACE VIEW game_scores AS
  SELECT user_id, finished_at, score FROM puzzle_plays
  UNION ALL
  SELECT user_id, finished_at, score FROM bukvin_plays;
DROP TABLE razvin_plays;
