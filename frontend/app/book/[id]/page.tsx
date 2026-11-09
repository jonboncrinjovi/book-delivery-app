"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { addItem } from "@/lib/cart";
import { GRAPE_NAMES, GrapeRow } from "@/components/GrapeRow";
import { Disclaimer } from "@/components/Disclaimer";
import { useV } from "@/lib/address";

type Product = {
  id: number; name: string; author: string | null; description: string; hook: string;
  price_cents: number; category: string; slots: number; available: boolean; cover: string | null;
};
type Review = { id: number; product_id: number; author: string; text: string; avg: number; votes: number; plaque: boolean; created_at: string };

const WINE = "#57030d";
const CREAM = "#f4ead6";
const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;
const day = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const bookId = Number(id);
  const [p, setP] = useState<Product | null>(null);
  const [missing, setMissing] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [added, setAdded] = useState(false);
  const [owned, setOwned] = useState(false); // delivered to them: offer it as a gift
  const v = useV();
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/products/${bookId}`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setP).catch(() => setMissing(true));
    fetch("/api/reviews").then((r) => r.json())
      .then((all: Review[]) => setReviews(all.filter((r) => r.product_id === bookId))).catch(() => {});
    fetch("/api/me/reviewable").then((r) => (r.ok ? r.json() : [])).then((books: { id: number }[]) => {
      const ok = books.some((b) => b.id === bookId);
      setCanReview(ok);
      setOwned(ok);
      // from the bookmark on the shelf: open the form straight away
      if (ok && new URLSearchParams(window.location.search).has("write")) setWriting(true);
    }).catch(() => {});
  }, [bookId]);

  useEffect(() => {
    if (writing) formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [writing]);

  async function submit() {
    setMessage("");
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: bookId, text }),
    });
    if (!res.ok) {
      setMessage((await res.text()).trim());
      return;
    }
    setMessage("Спасибо! Рецензия появится после модерации.");
    setText(""); setWriting(false); setCanReview(false);
  }

  function add() {
    if (!p) return;
    addItem({ id: p.id, name: p.name, category: p.category, price_cents: p.price_cents, slots: p.slots });
    setAdded(true);
  }

  if (missing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-xl">Такой книги у нас нет</p>
        <Link href="/reviews" className="rounded-full bg-wine px-6 py-3 font-sans text-paper-2">К рецензиям</Link>
      </div>
    );
  }
  if (!p) return <div className="h-full" />;

  // the book's own level: every review's average, weighted by how many votes it got
  const votes = reviews.reduce((s, r) => s + r.votes, 0);
  const bookLevel = votes ? Math.round(reviews.reduce((s, r) => s + r.avg * r.votes, 0) / votes) : 0;

  return (
    <div className="h-full rounded-xl bg-[#cdb08a] p-3">
      {/* the frame stays put, the corners sit on it, only the inside scrolls */}
      <div className="relative h-full border-[3px] border-double border-black/70 shadow-md" style={{ background: CREAM }}>

        <div className="h-full overflow-y-auto px-6 py-8 text-black">
          {/* the book on its shelf */}
          <div className="flex flex-col items-center">
            {p.cover ? (
              <img src={p.cover} alt={p.name} className="max-h-[34dvh] w-auto object-contain drop-shadow-xl" />
            ) : (
              <div className="flex h-48 w-32 items-center justify-center text-4xl shadow-xl" style={{ background: "#c9a77a" }}>{p.name.charAt(0)}</div>
            )}
            <div className="h-3 w-3/4 rounded-sm bg-gradient-to-b from-[#f3e6cc] to-[#c9ad83] shadow-[0_6px_8px_rgba(0,0,0,0.3)]" />
          </div>

          <h1 className="mt-5 text-2xl leading-tight" style={{ color: WINE }}>{p.name}</h1>
          {p.author && <p className="font-sans text-sm opacity-60">{p.author}</p>}
          <p className="mt-3 leading-snug" style={{ color: WINE }}>{p.hook || p.description}</p>
          {p.hook && p.description && <p className="mt-2 text-sm leading-snug opacity-80">{p.description}</p>}

          <button onClick={add} disabled={!p.available || added}
            className="mt-5 w-full rounded-full py-3 text-xl shadow-lg disabled:opacity-60" style={{ background: WINE, color: CREAM }}>
            {!p.available ? "Нет в наличии" : added ? "В корзине" : `${owned ? "Подарить" : "Добавить в корзину"} · ${rub(p.price_cents)}`}
          </button>
          {added && <Link href="/cart" className="mt-2 block text-center font-sans text-sm underline">Перейти в корзину</Link>}
          {added && owned && <p className="mt-1 text-center font-sans text-xs opacity-70">При оформлении отметьте, что это подарок, и укажите получателя.</p>}
          {p.category === "drink" && <Disclaimer />}

          {/* the book's reviews */}
          <section className="mt-8">
            <div className="flex items-center justify-between">
              <p className="text-xl" style={{ color: WINE }}>Рецензии</p>
              <span className="flex items-center gap-2 font-sans text-xs">
                <GrapeRow level={bookLevel} />
                {bookLevel ? GRAPE_NAMES[bookLevel] : ""}
              </span>
            </div>

            {reviews.length === 0 && <p className="mt-2 font-sans text-sm opacity-60">О ней ещё никто не написал.</p>}
            <ul className="mt-2 space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="border-t border-black/10 pt-3">
                  <GrapeRow level={r.votes ? Math.round(r.avg) : 0} size={8} />
                  {r.plaque && <span className="ml-2 font-sans text-xs font-bold" style={{ color: "#b8892d" }}>Золотая лоза</span>}
                  <p className="mt-1 italic leading-snug">«{r.text}»</p>
                  <p className="mt-1 font-sans text-xs opacity-60">{r.author}, {day(r.created_at)}</p>
                </li>
              ))}
            </ul>

            {canReview && !writing && (
              <button onClick={() => setWriting(true)} className="mt-4 w-full rounded-full border py-2 font-sans" style={{ borderColor: WINE, color: WINE }}>
                Написать рецензию
              </button>
            )}
            {writing && (
              <div ref={formRef} className="mt-4 space-y-2">
                <p className="font-sans text-xs opacity-60">{v("Не о сюжете, а о том, что книга с Вами сделала. До 200 знаков.", "Не о сюжете, а о том, что книга с тобой сделала. До 200 знаков.")}</p>
                <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={200} rows={3} autoFocus
                  placeholder="Что осталось после чтения?"
                  className="w-full rounded-md border border-black/20 bg-white p-3 font-sans text-[15px] outline-none focus:border-[#57030d]" />
                <div className="flex items-center justify-between font-sans text-sm">
                  <span className="opacity-60">{text.length}/200</span>
                  <button onClick={submit} disabled={text.trim().length < 10}
                    className="rounded-full px-5 py-2 disabled:opacity-40" style={{ background: WINE, color: CREAM }}>Отправить</button>
                </div>
              </div>
            )}
            {message && <p className="mt-2 font-sans text-sm" style={{ color: WINE }}>{message}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
