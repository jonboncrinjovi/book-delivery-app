-- +goose Up
-- the day's field: 48 prizes laid out before the tap, each drawn with the published odds; the tap picks one of them
CREATE TABLE razvin_boards (
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  play_date DATE NOT NULL,
  board     TEXT[] NOT NULL,
  PRIMARY KEY (user_id, play_date)
);

-- +goose Down
DROP TABLE razvin_boards;
