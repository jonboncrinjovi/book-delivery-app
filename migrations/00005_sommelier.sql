-- +goose Up
-- note: Postgres can add enum values but never remove them, so Down leaves this in place
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'stationery';

ALTER TABLE products
    ADD COLUMN cover_path      TEXT,                          -- original cover, random filename
    ADD COLUMN cover_blur_path TEXT,                          -- blurred copy, different random filename
    ADD COLUMN hook            TEXT NOT NULL DEFAULT '',      -- first line or one striking line
    ADD COLUMN hints           TEXT[] NOT NULL DEFAULT '{}';  -- blind-date hint words; TEXT[] = a list of texts

CREATE TABLE tags (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name      TEXT NOT NULL,
    parent_id BIGINT REFERENCES tags(id) ON DELETE CASCADE,   -- NULL = anchor genre; else the anchor it hangs on
    UNIQUE NULLS NOT DISTINCT (name, parent_id)               -- no duplicate names under the same parent
);

CREATE TABLE book_tags (
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_id     BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)                          -- a tag attaches to a book once
);

CREATE TABLE book_quotes (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    text       TEXT NOT NULL CHECK (length(text) <= 300)
);

-- starter genres; edit freely later. The CTE ("WITH a AS ...") inserts the anchors,
-- hands back their new ids, and the second INSERT attaches the subtags to them by name.
WITH a AS (
    INSERT INTO tags (name) VALUES
        ('Фантастика'), ('Ужасы'), ('Детектив'), ('Любовный роман'), ('Классика')
    RETURNING id, name
)
INSERT INTO tags (name, parent_id)
SELECT s.name, a.id
FROM a JOIN (VALUES
    ('Фантастика', 'Путешествия во времени'), ('Фантастика', 'Космос'),
    ('Фантастика', 'Антиутопия'), ('Фантастика', 'Искусственный интеллект'),
    ('Ужасы', 'Призраки'), ('Ужасы', 'Вампиры'),
    ('Ужасы', 'Психологический хоррор'), ('Ужасы', 'Мистика'),
    ('Детектив', 'Нуар'), ('Детектив', 'Классический детектив'), ('Детектив', 'Триллер'),
    ('Любовный роман', 'Исторический роман'), ('Любовный роман', 'Современная проза'),
    ('Классика', 'Русская классика'), ('Классика', 'Зарубежная классика')
) AS s(anchor, name) ON s.anchor = a.name;

-- +goose Down
DROP TABLE book_quotes;
DROP TABLE book_tags;
DROP TABLE tags;
ALTER TABLE products DROP COLUMN hints, DROP COLUMN hook,
    DROP COLUMN cover_blur_path, DROP COLUMN cover_path;
