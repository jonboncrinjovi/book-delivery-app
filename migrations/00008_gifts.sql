-- +goose Up
-- "sort" fixes the display order; the catch-all answers get 99 so they always come last
CREATE TABLE recipients (code TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL);
INSERT INTO recipients (code, name, sort) VALUES
    ('friend', 'Другу', 1), ('friend_f', 'Подруге', 2), ('girlfriend', 'Девушке', 3),
    ('boyfriend', 'Парню', 4), ('wife', 'Жене', 5), ('husband', 'Мужу', 6),
    ('mom', 'Маме', 7), ('dad', 'Папе', 8), ('relative', 'Родственнику', 9),
    ('colleague', 'Коллеге', 10), ('teacher', 'Учителю', 11), ('close', 'Просто близкому', 99);

CREATE TABLE occasions (code TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL);
INSERT INTO occasions (code, name, sort) VALUES
    ('birthday', 'День рождения', 1), ('wedding', 'Свадьба', 2), ('anniversary', 'Годовщина', 3),
    ('housewarming', 'Новоселье', 4), ('baby', 'Рождение ребёнка', 5), ('get_well', 'Выздоравливай', 6),
    ('sorry', 'Извинение', 7), ('thanks', 'Благодарность', 8), ('new_year', 'Новый год', 9),
    ('march8', '8 Марта', 10), ('feb23', '23 Февраля', 11), ('graduation', 'Выпускной', 12),
    ('new_job', 'Новая работа', 13), ('just_because', 'Просто порадовать', 99);

-- which occasions a card design fits; a card with no rows here is universal
CREATE TABLE design_occasions (
    design_id BIGINT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    occasion  TEXT NOT NULL REFERENCES occasions(code) ON DELETE CASCADE,
    PRIMARY KEY (design_id, occasion)
);

-- same for products, mainly flowers: which occasions they suit
CREATE TABLE product_occasions (
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    occasion   TEXT NOT NULL REFERENCES occasions(code) ON DELETE CASCADE,
    PRIMARY KEY (product_id, occasion)
);

ALTER TABLE orders
    ADD COLUMN gift      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN recipient TEXT REFERENCES recipients(code),
    ADD COLUMN occasion  TEXT REFERENCES occasions(code);

-- +goose Down
ALTER TABLE orders DROP COLUMN occasion, DROP COLUMN recipient, DROP COLUMN gift;
DROP TABLE product_occasions;
DROP TABLE design_occasions;
DROP TABLE occasions;
DROP TABLE recipients;
