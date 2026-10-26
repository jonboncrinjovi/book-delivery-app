-- +goose Up
-- (originally planned as 00007; renumbered because 00008 was applied first)

-- the sommelier's list: for this anchor genre, this product, and why
CREATE TABLE pairings (
    anchor_tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    note          TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (anchor_tag_id, product_id)
);

CREATE TABLE bag_colors (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hex  TEXT NOT NULL
);
INSERT INTO bag_colors (code, name, hex) VALUES
    ('brown', 'крафтовый', '#a47551'),
    ('white', 'белый', '#f4f1ea'),
    ('red', 'винный', '#8c2f39'),
    ('yellow', 'жёлтый', '#e8c95a');

-- the paper bag: a free packaging option with its own capacity
INSERT INTO box_sizes (code, name, capacity_slots, price_cents) VALUES ('BAG', 'Пакет', 8, 0);

-- NULL = "surprise me": you pick the colour when packing
ALTER TABLE orders ADD COLUMN bag_color TEXT REFERENCES bag_colors(code);

-- +goose Down
ALTER TABLE orders DROP COLUMN bag_color;
DELETE FROM box_sizes WHERE code = 'BAG';
DROP TABLE bag_colors;
DROP TABLE pairings;
