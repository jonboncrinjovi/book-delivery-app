#!/bin/sh
# usage: ./stats.sh            → today
#        ./stats.sh 2026-10-24 → any given day
set -e
cd "$HOME/book-delivery-app"
DAY="${1:-$(date +%F)}"       # first argument, or today's date if none given

# -T: no terminal needed; -v day=...: a psql variable, used below as :'day'
docker compose exec -T db psql -U app books -v day="$DAY" <<'SQL'
\echo
\echo '=== Заказы, оформленные за день ==='
SELECT status, count(*) AS заказов, sum(total_cents) / 100.0 AS рублей
FROM orders
WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date = :'day'
GROUP BY status ORDER BY status;

\echo '=== Доставлено за день (собранные деньги) ==='
SELECT count(*) AS доставлено,
       coalesce(sum(o.total_cents), 0) / 100.0 AS выручка,
       coalesce(sum(o.delivery_fee_cents), 0) / 100.0 AS из_них_доставка,
       coalesce(round(avg(o.total_cents) / 100.0), 0) AS средний_чек
FROM orders o
JOIN order_events e ON e.order_id = o.id AND e.status = 'delivered'
WHERE (e.at AT TIME ZONE 'Europe/Moscow')::date = :'day';

\echo '=== Топ товаров за день ==='
SELECT p.name AS товар, sum(i.quantity) AS продано
FROM order_items i
JOIN orders o ON o.id = i.order_id
JOIN products p ON p.id = i.product_id
WHERE o.status <> 'cancelled'
  AND (o.created_at AT TIME ZONE 'Europe/Moscow')::date = :'day'
GROUP BY p.name ORDER BY продано DESC LIMIT 5;

\echo '=== Заканчивается (2 и меньше) ==='
SELECT name AS товар, stock AS осталось
FROM products WHERE active AND stock <= 2 ORDER BY stock;
SQL
