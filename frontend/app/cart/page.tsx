"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { setPackaging, setQty, useCart } from "@/lib/cart";

type BoxSize = { code: string; name: string; capacity_slots: number | null; price_cents: number };
type BagColor = { code: string; name: string; hex: string };

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;
const FREE_FROM = 300000; // mirrors the server's settings table; the server has the final word at checkout

export default function CartPage() {
  const cart = useCart();
  const [boxes, setBoxes] = useState<BoxSize[]>([]);
  const [colors, setColors] = useState<BagColor[]>([]);

  useEffect(() => {
    fetch("/api/box-sizes").then((r) => r.json()).then(setBoxes).catch(() => {});
    fetch("/api/bag-colors").then((r) => r.json()).then(setColors).catch(() => {});
  }, []);

  if (cart.items.length === 0) {
    return (
      <div className="pt-10 text-center">
        <h1 className="text-3xl font-bold">Корзина пуста</h1>
        <Link href="/sommelier" className="mt-6 inline-block rounded-full bg-wine px-6 py-3 font-sans text-paper-2">
          К сомелье
        </Link>
      </div>
    );
  }

  const packaging = boxes.find((b) => b.code === cart.box);
  const used = cart.items.reduce((n, i) => n + i.slots * i.qty, 0);
  const capacity = packaging?.capacity_slots ?? null;
  const overfull = capacity !== null && used > capacity;
  const itemsTotal = cart.items.reduce((sum, i) => sum + i.price_cents * i.qty, 0);
  const subtotal = itemsTotal + (packaging?.price_cents ?? 0) + (cart.card?.price_cents ?? 0);
  const toFree = Math.max(0, FREE_FROM - subtotal);

  return (
    <div className="pt-4">
      <h1 className="text-3xl font-bold">Корзина</h1>

      {/* items */}
      <ul className="mt-5 divide-y divide-line rounded-2xl border border-line bg-paper-2">
        {cart.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 p-4">
            <div className="flex-1">
              <p>{i.hidden ? "Книга-сюрприз" : i.name}</p>
              <p className="font-sans text-sm text-muted">{rub(i.price_cents)}{i.hidden && " · откроешь при получении"}</p>
            </div>
            <button onClick={() => setQty(i.id, i.qty - 1)} className="size-9 rounded-full border border-line font-sans">−</button>
            <span className="w-5 text-center font-sans">{i.qty}</span>
            <button onClick={() => setQty(i.id, i.qty + 1)} className="size-9 rounded-full border border-line font-sans">+</button>
          </li>
        ))}
      </ul>

      {/* gift and card summary */}
      {cart.gift?.gift && (
        <p className="mt-4 font-sans text-sm">Подарок: {cart.gift.recipientName}, {cart.gift.occasionName}</p>
      )}
      {cart.card && (
        <p className="mt-1 font-sans text-sm">Открытка{cart.card.name ? ` «${cart.card.name}»` : ""}: «{cart.card.text}»</p>
      )}

      {/* packaging */}
      <h2 className="mt-8 text-xl font-bold">Упаковка</h2>
      <p className="mt-1 font-sans text-sm text-muted">Пакет с нашим штампом бесплатно. Или коробка.</p>

      <div className="mt-4 flex flex-wrap gap-3">
        {colors.map((c) => (
          <button key={c.code} onClick={() => setPackaging("BAG", c.code)} aria-label={c.name}
            className={`size-12 rounded-xl border-2 ${cart.box === "BAG" && cart.bag === c.code ? "border-wine" : "border-line"}`}
            style={{ backgroundColor: c.hex }} />
        ))}
        <button onClick={() => setPackaging("BAG", null)}
          className={`rounded-xl border-2 px-3 font-sans text-sm ${cart.box === "BAG" && cart.bag === null ? "border-wine" : "border-line"}`}>
          Удиви меня
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 font-sans text-sm">
        {boxes.filter((b) => b.code !== "BAG").map((b) => (
          <button key={b.code} onClick={() => setPackaging(b.code, null)}
            className={`rounded-xl border-2 bg-paper-2 p-3 text-left ${cart.box === b.code ? "border-wine" : "border-line"}`}>
            Коробка {b.name.toLowerCase()}
            <span className="block text-muted">{b.capacity_slots === null ? "цену обсудим" : rub(b.price_cents)}</span>
          </button>
        ))}
      </div>

      <p className={`mt-3 font-sans text-sm ${overfull ? "text-wine" : "text-muted"}`}>
        {capacity === null ? `Занято мест: ${used}` : `Занято ${used} из ${capacity} мест`}
        {overfull && ". Не помещается: выбери коробку побольше."}
      </p>

      {/* free delivery progress */}
      <div className="mt-8 rounded-2xl border border-line bg-paper-2 p-4">
        <div className="h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-wine transition-all" style={{ width: `${Math.min(100, (subtotal / FREE_FROM) * 100)}%` }} />
        </div>
        <p className="mt-2 font-sans text-sm">
          {toFree > 0 ? `До бесплатной доставки: ${rub(toFree)}` : "Доставка по городу бесплатно"}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <span className="text-xl">Итого</span>
        <span className="text-2xl font-bold">{rub(subtotal)}</span>
      </div>
      <p className="font-sans text-xs text-muted">Без доставки; её посчитаем по адресу.</p>

      <button disabled={overfull}
        className="mt-6 w-full rounded-full bg-wine px-6 py-4 font-sans text-lg text-paper-2 disabled:opacity-40">
        Оформить заказ
      </button>
    </div>
  );
}
