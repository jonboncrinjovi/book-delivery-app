"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearCart, setQty, useCart } from "@/lib/cart";

type Quote = { subtotal_cents: number; delivery_fee_cents: number; total_cents: number; deliver_by: string; geocoded: boolean };
type BagColor = { code: string; name: string };
type BoxSize = { code: string; name: string };

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { weekday: "long", hour: "2-digit", minute: "2-digit" });

export default function OrderPage() {
  const router = useRouter();
  const cart = useCart();
  const c = cart.contact;
  const [express, setExpress] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [colors, setColors] = useState<BagColor[]>([]);
  const [boxes, setBoxes] = useState<BoxSize[]>([]);

  useEffect(() => {
    fetch("/api/bag-colors").then((r) => r.json()).then(setColors).catch(() => {});
    fetch("/api/box-sizes").then((r) => r.json()).then(setBoxes).catch(() => {});
  }, []);

  const gift = cart.gift?.gift ?? false;

  // the order as the API expects it; no coordinates: the server looks the address up itself
  function body(dryRun: boolean) {
    return {
      dry_run: dryRun,
      items: cart.items.map((i) => ({ product_id: i.id, quantity: i.qty, hidden: !!i.hidden })),
      box_size: cart.box,
      bag_color: cart.bag,
      gift,
      card_design_id: cart.card?.id ?? null,
      card_text: cart.card?.text ?? "",
      customer_name: c?.name ?? "",
      customer_phone: c?.phone ?? "",
      recipient_name: gift ? c?.recipientName ?? "" : c?.name ?? "",
      recipient_phone: gift ? c?.recipientPhone ?? "" : c?.phone ?? "",
      address: c ? [c.address, c.comment].filter(Boolean).join(", ") : "",
      delivery_type: express ? "express" : "standard",
    };
  }

  // price it on the server whenever the cart, the address or the delivery type changes
  useEffect(() => {
    if (!c || cart.items.length === 0) return;
    const timer = setTimeout(async () => {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(true)),
      });
      if (res.ok) {
        setQuote(await res.json());
        setError("");
      } else {
        setQuote(null);
        setError((await res.text()).trim());
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, express]);

  async function pay() {
    setSending(true);
    setError("");
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body(false)),
    });
    if (!res.ok) {
      setError((await res.text()).trim());
      setSending(false);
      return;
    }
    const order = await res.json();
    clearCart();
    router.push(`/order/${order.track}`);
  }

  if (cart.items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-xl">Корзина пуста</p>
        <Link href="/sommelier" className="rounded-full bg-wine px-6 py-3 font-sans text-paper-2">К сомелье</Link>
      </div>
    );
  }

  // the packaging line: bag colour or box, plus flowers and card
  const packaging = [
    cart.box === "BAG"
      ? `пакет${cart.bag ? `, ${colors.find((x) => x.code === cart.bag)?.name ?? ""}` : ", любой цвет"}`
      : `коробка ${boxes.find((x) => x.code === cart.box)?.name.toLowerCase() ?? ""}`,
    cart.items.some((i) => i.category === "flowers") && "цветы",
    cart.card && "открытка",
  ].filter(Boolean).join(" + ");

  const row = "flex items-center justify-between gap-2";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-[#f4ead6] text-black">
      {/* the photo: book, wine, cheese (plain kraft until hero.jpg exists) */}
      <div className="h-[26%] shrink-0 bg-[#c9a77a] bg-cover bg-center" style={{ backgroundImage: "url(/order/hero.jpg)" }} />

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4 pt-3">
        {/* the lines; only this list scrolls, if it ever gets long */}
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-lg">
          {cart.items.map((i) => (
            <li key={i.id} className={row}>
              <span className="min-w-0 truncate">{i.hidden ? "Книга-сюрприз" : i.name}{i.qty > 1 ? ` × ${i.qty}` : ""}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-sans text-sm">{rub(i.price_cents * i.qty)}</span>
                <button onClick={() => setQty(i.id, i.qty - 1)} aria-label="Убрать" className="font-sans opacity-50">×</button>
              </span>
            </li>
          ))}
        </ul>

        <Link href="/sommelier/wrap" className="shrink-0 rounded-md bg-[#7a1f2b] px-4 py-2 text-[#f4ead6]">
          Упаковка: {packaging}
        </Link>

        <Link href="/checkout" className="shrink-0 truncate rounded-md border border-black/30 px-3 py-2 font-sans text-sm">
          {c ? `Адрес: ${c.address}` : "Указать адрес и телефон →"}
        </Link>

        <div className="grid shrink-0 grid-cols-2 gap-2 font-sans text-sm">
          <button onClick={() => setExpress(false)}
            className={`rounded-md border px-3 py-2 ${!express ? "border-[#7a1f2b] bg-[#7a1f2b] text-[#f4ead6]" : "border-black/30"}`}>
            Обычная{!express && quote ? `: ${quote.delivery_fee_cents === 0 ? "бесплатно" : rub(quote.delivery_fee_cents)}` : ""}
          </button>
          <button onClick={() => setExpress(true)}
            className={`rounded-md border px-3 py-2 ${express ? "border-[#7a1f2b] bg-[#7a1f2b] text-[#f4ead6]" : "border-black/30"}`}>
            Экспресс 2 ч{express && quote ? `: ${rub(quote.delivery_fee_cents)}` : ""}
          </button>
        </div>

        {quote && (
          <div className="shrink-0">
            <p className={`${row} text-xl`}><span>Итог</span><span className="font-bold">{rub(quote.total_cents)}</span></p>
            <p className="font-sans text-xs opacity-60">
              Привезём до: {when(quote.deliver_by)}
              {!quote.geocoded && " · адрес уточним по телефону"}
            </p>
          </div>
        )}
        {error && <p className="shrink-0 font-sans text-sm text-[#7a1f2b]">{error}</p>}

        <button onClick={pay} disabled={!c || !quote || sending}
          className="shrink-0 rounded-md bg-[#7a1f2b] px-6 py-3 font-sans uppercase tracking-wide text-[#f4ead6] disabled:opacity-40">
          {sending ? "Оформляем…" : "Оплатить"}
        </button>
        <p className="shrink-0 text-center font-sans text-[10px] opacity-60">
          Онлайн-оплата скоро появится. Пока мы позвоним, чтобы подтвердить заказ.
        </p>
      </div>
    </div>
  );
}
