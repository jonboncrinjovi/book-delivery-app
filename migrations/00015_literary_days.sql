-- +goose Up
-- "on this day": the butler mentions one of these when today's date matches.
-- Dates are Gregorian (new style). Extend freely: publications, premieres, anniversaries.
CREATE TABLE literary_days (
    id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    day   SMALLINT NOT NULL CHECK (day BETWEEN 1 AND 31),
    year  INTEGER NOT NULL,
    text  TEXT NOT NULL   -- completes "ровно N лет назад …", e.g. "родился Фёдор Достоевский"
);
CREATE INDEX ON literary_days (month, day);

INSERT INTO literary_days (month, day, year, text) VALUES
    (6, 6, 1799, 'родился Александр Пушкин'),
    (11, 11, 1821, 'родился Фёдор Достоевский'),
    (9, 9, 1828, 'родился Лев Толстой'),
    (4, 1, 1809, 'родился Николай Гоголь'),
    (1, 29, 1860, 'родился Антон Чехов'),
    (5, 15, 1891, 'родился Михаил Булгаков'),
    (10, 15, 1814, 'родился Михаил Лермонтов'),
    (6, 23, 1889, 'родилась Анна Ахматова'),
    (5, 24, 1940, 'родился Иосиф Бродский');

-- +goose Down
DROP TABLE literary_days;
