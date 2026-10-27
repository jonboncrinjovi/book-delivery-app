"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearCart, useCart } from "@/lib/cart";

// Leaflet touches "window" as soon as it loads, which doesn't exist on the server,
// so the map is loaded in the browser only
const MapPicker = dynamic(() => import("@/components/MapPicker"), { ssr: false });

type Quote = { subtotal_cents: number; delivery_fee_cents: number; total_cents: number; deliver_by: string };

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

const input = "w-full rounded-2xl border border-line bg-paper-2 px-4 py-3 font-sans outline-none focus:border-wine";

export default function Checkout() {
  const cart = useCart();
  const router = useRouter();
  const gift = cart.gift?.gift ?? false;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rName, setRName] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [express, setExpress] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // logged in? pre-fill the name
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m) setName((n) => n || m.name);
      })
      .catch(() => {});
  }, []);

  // the order as the API expects it; dryRun = just ask for the price
  function orderBody(dryRun: boolean) {
    return {
      dry_run: dryRun,
      items: cart.items.map((i) => ({ product_id: i.id, quantity: i.qty, hidden: !!i.hidden })),
      box_size: cart.box,
      bag_color: cart.bag,
      gift,
      recipient: cart.gift?.recipient ?? null,
      occasion: cart.gift?.occasion ?? null,
      card_design_id: cart.card?.id ?? null,
      card_text: cart.card?.text ?? "",
      customer_name: name,
      customer_phone: phone,
      recipient_name: gift ? rName : name,
      recipient_phone: gift ? rPhone : phone,
      address,
      lat,
      lon,
      delivery_type: express ? "express" : "standard",
    };
  }

  // re-price whenever the pin, the delivery type or the cart changes.
  // The 300 ms wait (debounce) avoids a request for every tiny pin adjustment.
  useEffect(() => {
    if (lat === null || lon === null || cart.items.length === 0) return;
    const timer = setTimeout(async () => {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderBody(true)),
      });
      if (res.ok) {
        setQuote(await res.json());
        setError("");
      } else {
        setQuote(null);
        setError((await res.text()).trim());
      }
    }, 300);
    return () => clearTimeout(timer); // a newer change cancels the pending request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, express, cart]);

  // address → coordinates via OpenStreetMap's free geocoder; the pin can then be fine-tuned by tapping
  async function locate() {
    if (!address.trim()) return;
    const q = new URLSearchParams({ q: address, format: "json", limit: "1", countrycodes: "ru", "accept-language": "ru" });
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`);
      const found = await res.json();
      if (found.length === 0) {
        setError("Адрес не нашёлся. Поставь точку на карте сам.");
        return;
      }
      setLat(Number(found[0].lat));
      setLon(Number(found[0].lon));
    } catch {
      setError("Поиск не ответил. Поставь точку на карте сам.");
    }
  }

  async function submit() {
    setSending(true);
    setError("");
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderBody(false)),
    });
    if (!res.ok) {
      setError((await res.text()).trim());
      setSending(false);
      return;
    }
    const order = await res.json();
    clearCart();
    router.push(`/order/${order.track}`); // the secret tracking link
  }

  if (cart.items.length === 0) {
    return (
      <div className="pt-10 text-center">
        <h1 className="text-3xl font-bold">Корзина пуста</h1>
        <Link href="/sommelier" className="mt-6 inline-block rounded-full bg-wine px-6 py-3 font-sans text-paper-2">К сомелье</Link>
      </div>
    );
  }

  const ready = name && phone && address && lat !== null && (!gift || (rName && rPhone)) && quote && !sending;

  return (
    <div className="pt-4">
      <h1 className="text-3xl font-bold">Оформление</h1>

      <h2 className="mt-6 text-xl font-bold">{gift ? "Ты" : "Получатель"}</h2>
      <div className="mt-2 space-y-2">
        <input className={input} placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input} placeholder="Телефон" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      {gift && (
        <>
          <h2 className="mt-6 text-xl font-bold">Получатель</h2>
          <div className="mt-2 space-y-2">
            <input className={input} placeholder="Имя получателя" value={rName} onChange={(e) => setRName(e.target.value)} />
            <input className={input} placeholder="Телефон получателя" type="tel" value={rPhone} onChange={(e) => setRPhone(e.target.value)} />
          </div>
        </>
      )}

      <h2 className="mt-6 text-xl font-bold">Адрес</h2>
      <div className="mt-2 flex gap-2">
        <input className={input} placeholder="Улица, дом, квартира" value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && locate()} />
        <button onClick={locate} className="shrink-0 rounded-2xl border border-wine px-4 font-sans text-wine">Найти</button>
      </div>
      <div className="mt-3">
        <MapPicker lat={lat} lon={lon} onPick={(a, b) => { setLat(a); setLon(b); }} />
      </div>
      <p className="mt-1 font-sans text-xs text-muted">Нажми на карте точно у входа: так курьер найдёт быстрее.</p>

      <h2 className="mt-6 text-xl font-bold">Доставка</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 font-sans text-sm">
        <button onClick={() => setExpress(false)}
          className={`rounded-2xl border-2 bg-paper-2 p-3 text-left ${!express ? "border-wine" : "border-line"}`}>
          Обычная
          <span className="block text-muted">сегодня, если до 19:00</span>
        </button>
        <button onClick={() => setExpress(true)}
          className={`rounded-2xl border-2 bg-paper-2 p-3 text-left ${express ? "border-wine" : "border-line"}`}>
          Экспресс
          <span className="block text-muted">за 2 часа</span>
        </button>
      </div>

      {quote && (
        <div className="mt-6 space-y-1 rounded-2xl border border-line bg-paper-2 p-4 font-sans">
          <p className="flex justify-between"><span>Товары и упаковка</span><span>{rub(quote.subtotal_cents)}</span></p>
          <p className="flex justify-between">
            <span>Доставка</span>
            <span>{quote.delivery_fee_cents === 0 ? "бесплатно" : rub(quote.delivery_fee_cents)}</span>
          </p>
          <p className="flex justify-between pt-2 text-lg font-bold"><span>Итого</span><span>{rub(quote.total_cents)}</span></p>
          <p className="pt-2 text-sm text-muted">Привезём до: {when(quote.deliver_by)}</p>
        </div>
      )}
      {lat === null && <p className="mt-6 font-sans text-sm text-muted">Укажи адрес, чтобы посчитать доставку.</p>}
      {error && <p className="mt-4 font-sans text-sm text-wine">{error}</p>}

      <button onClick={submit} disabled={!ready}
        className="mt-6 w-full rounded-full bg-wine px-6 py-4 font-sans text-lg text-paper-2 disabled:opacity-40">
        {sending ? "Оформляем…" : "Заказать"}
      </button>
      <p className="mt-2 text-center font-sans text-xs text-muted">Онлайн-оплата скоро. Пока мы свяжемся для оплаты.</p>
    </div>
  );
}
