"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addItem } from "@/lib/cart";
import { addToShelf } from "@/lib/shelf";
import { useV } from "@/lib/address";

type Magi = { text: string; author: string; grapes: number; plaque: boolean; quote: boolean };
type Masked = { id: number; price_cents: number; cover_blur: string | null; hints: string[]; tags: string[]; magi: Magi[] };
type Revealed = { id: number; name: string; author: string | null; cover: string | null; hook: string; description: string; price_cents: number };
type SwipeControl = { fling: (dir: 1 | -1) => void };

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;

// where the four notes are pinned (percent of the card): overlapping the cover, each at its own angle
const NOTES: { style: CSSProperties; rot: number }[] = [
  { style: { right: "-3%", top: "5%", width: "60%" }, rot: 6 },
  { style: { left: "-5%", top: "26%", width: "60%" }, rot: -5 },
  { style: { right: "-4%", top: "48%", width: "60%" }, rot: 4 },
  { style: { left: "4%", top: "69%", width: "60%" }, rot: -3 },
];

// five small berries; filled ones show the average rating
function Grapes({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="flex gap-0.5" aria-label={`${full} из 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`size-2.5 rounded-full border border-[#6b1f2b] ${n <= full ? "bg-[#6b1f2b]" : ""}`} />
      ))}
    </span>
  );
}

// one pinned note: kraft paper, black ink, a red pin at the top
function Note({ m, style, rot, delay }: { m: Magi; style: CSSProperties; rot: number; delay: number }) {
  return (
    <div className="absolute z-10 rounded-sm border border-black/20 bg-[#f4ead6] p-2 text-black shadow-md motion-safe:animate-swoop"
      style={{ ...style, rotate: `${rot}deg`, animationDelay: `${delay}s` }}>
      <span className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-[#8c2f39] shadow" />
      <div className="mb-1 flex items-center gap-1.5">
        {m.plaque && <span className="size-3.5 rounded-full bg-[#e3b341] ring-1 ring-[#a37a1f]" title="Золотая лоза" />}
        {m.quote
          ? <span className="font-sans text-[10px] uppercase tracking-wide opacity-60">Цитата</span>
          : <Grapes value={m.grapes} />}
      </div>
      <p className="line-clamp-4 text-[12px] font-semibold leading-snug">{m.quote ? `«${m.text}»` : m.text}</p>
      {!m.quote && <p className="mt-1 text-right font-sans text-[10px] opacity-60">— {m.author}</p>}
    </div>
  );
}

const icon = (paths: string[]) => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
);
const refreshIcon = icon(["M20 11a8 8 0 0 0-14.9-3.9", "M4 4v4h4", "M4 13a8 8 0 0 0 14.9 3.9", "M20 20v-4h-4"]);
const heartIcon = <img src="/pick/heart.png" alt="" className="size-9 object-contain" />;

export default function PickPage() {
  const router = useRouter();
  const swipe = useRef<SwipeControl | null>(null);
  const tagIds = useRef<number[]>([]); // the tags chosen on the previous screen, read once from the address
  const [card, setCard] = useState<Masked | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [seen, setSeen] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false); // ♥ pressed: offer "ещё" or "оформить"
  const v = useV();

  async function pick(exclude: number[]) {
    setRevealed(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/sommelier/pick?tags=${tagIds.current.join(",")}&exclude=${exclude.join(",")}`);
      if (res.status === 404) {
        setCard(null);
        setMessage("Сомелье перебрал всё по этим тегам.");
        return;
      }
      if (!res.ok) throw new Error();
      setCard(await res.json());
      setMessage("");
    } catch {
      setMessage(v("Что-то пошло не так, попробуйте ещё раз", "Что-то пошло не так, попробуй ещё раз"));
    }
  }

  // «Задать» was already pressed on the tags screen: start picking right away
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    tagIds.current = [p.get("anchor"), ...(p.get("tags")?.split(",") ?? [])].filter(Boolean).map(Number);
    pick([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ↻ or swipe left: the next book
  function next() {
    if (!card) return;
    const ex = [...seen, card.id];
    setSeen(ex);
    pick(ex);
  }

  // ♥ or swipe right: onto the shelf, as a parcel if it wasn't opened
  function keep() {
    if (!card) return;
    addToShelf({ id: card.id, name: revealed?.name, cover: revealed?.cover ?? undefined, price_cents: card.price_cents, hidden: !revealed });
    setSaved(true);
  }

  function orderNow() {
    if (!card) return;
    addItem({
      id: card.id, category: "book", name: revealed ? revealed.name : "Книга-сюрприз",
      price_cents: card.price_cents, slots: 2, hidden: !revealed,
    });
    router.push(`/sommelier/next?book=${card.id}`); // on to wine and snack
  }

  async function reveal() {
    if (!card) return;
    const res = await fetch(`/api/sommelier/reveal/${card.id}`);
    if (res.ok) setRevealed(await res.json());
  }

  async function markRead() {
    if (!card) return;
    const res = await fetch("/api/me/reads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: card.id }),
    });
    if (res.status === 401) {
      setMessage(v("Войдите в профиле, и сомелье запомнит прочитанное", "Войди в профиле, и сомелье запомнит прочитанное"));
      return;
    }
    swipe.current?.fling(-1);
  }

  const cover = revealed ? revealed.cover : card?.cover_blur;

  return (
    <div className="flex h-full flex-col">
      {/* the card: as tall as the space allows, at book proportions */}
      <div className="relative min-h-0 flex-1">
        {card ? (
          <SwipeCard key={card.id} control={swipe} onLeft={next} onRight={keep} locked={saved}>
            <div className="relative mx-auto aspect-[2/3] h-full max-w-full">
              {/* kraft frame with a double ink border */}
              <div className="absolute inset-0 rounded-2xl bg-[#c9a77a] p-[6%] shadow-lg">
                <div className="h-full w-full border-[3px] border-double border-black/50 p-[5%]">
                  {cover
                    ? <img src={cover} alt="" draggable={false} className="h-full w-full object-cover" />
                    : <div className="h-full w-full bg-black/20" />}
                </div>
              </div>
              {!revealed && card.magi.map((m, i) => (
                <Note key={i} m={m} style={NOTES[i].style} rot={NOTES[i].rot} delay={0.2 + i * 0.25} />
              ))}
            </div>
          </SwipeCard>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-lg">{message || "Сомелье думает…"}</p>
            {message && (
              <Link href="/sommelier/tags" className="rounded-full bg-wine px-6 py-3 font-sans text-paper-2">Изменить теги</Link>
            )}
          </div>
        )}
      </div>

      {/* the paper strip: seal on its edge, ↻ left, ♥ right */}
      {card && (
        <div className="relative mt-4 shrink-0 rounded-2xl bg-[#efe6d4] px-6 pb-3 pt-14 text-black shadow-md">
          {!revealed && !saved && (
            <button onClick={reveal}
              className="absolute left-1/2 top-0 flex size-48 -translate-x-1/2 -translate-y-3/4 items-center justify-center bg-contain bg-center bg-no-repeat text-3xl text-[#f4ead6] drop-shadow-md transition active:scale-95" style={{ backgroundImage: "url(/pick/seal.png)" }}>
              Открыть
            </button>
          )}

          {saved ? (
            <div className="space-y-2 text-center">
              <p className="font-semibold">{revealed ? "На полке." : "На полке, пока что в обёртке."}</p>
              <div className="flex gap-2 font-sans text-sm">
                <button onClick={next} className="flex-1 rounded-full border border-[#57030d] px-3 py-2 text-[#57030d]">Подобрать ещё</button>
                <button onClick={orderNow} className="flex-1 rounded-full bg-[#57030d] px-3 py-2 text-[#f4ead6]">Оформить сейчас</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[#57030d]">
              <button onClick={() => swipe.current?.fling(-1)} aria-label="Другую книгу">{refreshIcon}</button>
              <div className="min-w-0 px-2 text-center">
                {revealed ? (
                  <>
                    <p className="truncate font-semibold text-black">{revealed.name}</p>
                    <p className="truncate font-sans text-xs text-black/60">{revealed.author}</p>
                  </>
                ) : (
                  <p className="text-2xl font-semibold text-black/75">{rub(card.price_cents)}</p>
                )}
              </div>
              <button onClick={() => swipe.current?.fling(1)} aria-label="На полку">{heartIcon}</button>
            </div>
          )}

          {revealed && !saved && (
            <button onClick={markRead} className="mt-1 block w-full text-center font-sans text-xs text-[#57030d] underline">
              Уже прочитано, не предлагать
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// follows the finger; a long drag or a fast flick throws the card off screen, then the action runs.
// locked: after ♥ the card stays put until the reader picks "ещё" or "оформить"
function SwipeCard({ onLeft, onRight, control, locked, children }: {
  onLeft: () => void;
  onRight: () => void;
  control?: { current: SwipeControl | null };
  locked?: boolean;
  children: ReactNode;
}) {
  const [startX, setStartX] = useState<number | null>(null);
  const [dx, setDx] = useState(0);
  const [flying, setFlying] = useState<{ x: number; ms: number } | null>(null);
  const last = useRef({ x: 0, t: 0, v: 0 });

  function fling(dir: 1 | -1, force = 1) {
    if (flying || locked) return;
    const ms = Math.max(160, Math.min(420, 420 / force));
    if (dir === 1) {
      // ♥ keeps the book: a short hop to the right and back, rather than flying away
      setDx(60);
      setTimeout(() => setDx(0), 180);
      onRight();
      return;
    }
    setFlying({ x: -window.innerWidth * 1.5, ms });
    setTimeout(onLeft, ms);
  }

  useEffect(() => {
    if (control) control.current = { fling };
  });

  function end(timeStamp: number) {
    if (startX === null) return;
    const v = timeStamp - last.current.t > 100 ? 0 : last.current.v;
    const force = Math.max(1, Math.abs(v) * 1.5);
    const flick = Math.abs(v) > 0.6;
    if (dx > 110 || (flick && v > 0)) fling(1, force);
    else if (dx < -110 || (flick && v < 0)) fling(-1, force);
    else setDx(0);
    setStartX(null);
  }

  const x = flying ? flying.x : dx;
  return (
    <div
      onPointerDown={(e) => {
        if (flying || locked) return;
        setStartX(e.clientX);
        last.current = { x: e.clientX, t: e.timeStamp, v: 0 };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (startX === null) return;
        const dt = e.timeStamp - last.current.t;
        if (dt > 0) last.current = { x: e.clientX, t: e.timeStamp, v: (e.clientX - last.current.x) / dt };
        setDx(e.clientX - startX);
      }}
      onPointerUp={(e) => end(e.timeStamp)}
      onPointerCancel={() => {
        setStartX(null);
        setDx(0);
      }}
      style={{
        transform: `translateX(${x}px) rotate(${x / 18}deg)`,
        transition: flying ? `transform ${flying.ms}ms cubic-bezier(.4,0,1,1)` : startX === null ? "transform 0.25s" : "none",
      }}
      className="h-full touch-pan-y select-none"
    >
      {children}
    </div>
  );
}
