-- +goose Up
-- the balance: the games plus published reviews, weekly votes and published comments
-- (the leaderboard keeps using game_scores, games only)
CREATE VIEW point_scores AS
  SELECT user_id, finished_at, score FROM game_scores
  UNION ALL
  SELECT user_id, COALESCE(published_at, created_at), 50 FROM reviews WHERE status::text = 'published'
  UNION ALL
  SELECT user_id, COALESCE(published_at, created_at), 30 FROM service_reviews WHERE status::text = 'published'
  UNION ALL
  SELECT user_id, created_at, 15 FROM obzor_votes
  UNION ALL
  SELECT user_id, created_at, 10 FROM obzor_comments WHERE status = 'published';

-- +goose Down
DROP VIEW point_scores;
