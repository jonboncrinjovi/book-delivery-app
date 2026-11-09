"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GRAPE_NAMES, GrapeRow } from "@/components/GrapeRow";
import { Disclaimer } from "@/components/Disclaimer";
import AboutUs from "@/components/AboutUs";
import Obzor from "@/components/Obzor";
import { useV } from "@/lib/address";

type Review = {
  id: number; product_id: number; book: string; author: string; text: string;
  avg: number; votes: number; plaque: boolean; my_vote: number | null; mine: boolean; created_at: string;
};
type ServiceReview = { id: number; author: string; grapes: number; text: string; at: string };
type Activity = { who: string; book: string; at: string };
type OrderRef = { id: number; created_at: string };
type BookHit = { id: number; name: string; author: string | null; cover: string | null };

const WINE = "#57030d";
const CREAM = "#f4ead6";
const KRAFT = "#cdb08a";
const GOLD = "#b8892d";

// edit this: who you are, how you pack, why books and wine
const TEAM_TITLE = "Кто мы";
const TEAM_TEXT = "Здесь будет рассказ о команде: кто мы, как собираем посылки и почему книги и вино.";

const day = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const level = (r: Review) => (r.votes > 0 ? Math.round(r.avg) : 0);
const input = "w-full rounded-md border border-black/20 bg-white p-3 font-sans text-[15px] outline-none focus:border-[#57030d]";

export default function ReviewsPage() {
  const [tab, setTab] = useState<"books" | "service" | "obzor">("books");
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden rounded-xl bg-[#e9e2d3] p-3 text-black">
      <Ticker />
      <div className="grid shrink-0 grid-cols-2 gap-3">
        {(["books", "service", "obzor"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md py-2 text-lg shadow-md transition-opacity ${t === "obzor" ? "col-span-2" : ""} ${tab === t ? "" : "opacity-60"}`}
            style={{ background: WINE, color: CREAM }}>
            {t === "books" ? "Обзоры книг" : t === "service" ? "Обзоры доставок" : "Литературный обзор"}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "books" ? <BookReviews /> : tab === "obzor" ? <Obzor /> : <ServiceReviews />}
      </div>
    </div>
  );
}

// the line on top: the latest reviews, one at a time
function Ticker() {
  const [items, setItems] = useState<Activity[]>([]);
  const [i, setI] = useState(0);
  useEffect(() => {
    const load = () => fetch("/api/reviews/activity").then((r) => r.json()).then(setItems).catch(() => {});
    load();
    const refresh = setInterval(load, 10_000);
    const rotate = setInterval(() => setI((n) => n + 1), 4_000);
    return () => { clearInterval(refresh); clearInterval(rotate); };
  }, []);
  const a = items.length ? items[i % Math.min(items.length, 5)] : null;
  return (
    <div className="shrink-0 rounded-md p-1.5 shadow-md" style={{ background: WINE }}>
      <p key={i} className="animate-[fadein_0.6s] truncate rounded-sm px-3 py-1" style={{ background: CREAM, color: WINE }}>
        {a ? `@${a.who.replace(/^@/, "")} оставил(а) рецензию на «${a.book}»` : "Здесь появятся новые рецензии"}
      </p>
    </div>
  );
}

function Pager({ page, pages, set }: { page: number; pages: number; set: (p: number) => void }) {
  if (pages <= 1) return null;
  const arrow = "flex h-8 w-8 items-center justify-center rounded-full text-xl disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center justify-center gap-4 font-sans text-sm">
      <button className={arrow} style={{ background: WINE, color: CREAM }} disabled={page === 0} onClick={() => set(page - 1)} aria-label="Назад">‹</button>
      <span>{page + 1} / {pages}</span>
      <button className={arrow} style={{ background: WINE, color: CREAM }} disabled={page >= pages - 1} onClick={() => set(page + 1)} aria-label="Дальше">›</button>
    </div>
  );
}

// the level illustration on kraft cards; berries if the picture isn't there yet
function Art({ level }: { level: number }) {
  const [ok, setOk] = useState(true);
  if (!ok || level === 0) return <GrapeRow level={level} />;
  return <img src={`/grapes/${level}.png`} alt={GRAPE_NAMES[level]} onError={() => setOk(false)} className="mx-auto h-[45%] min-h-0 object-contain" />;
}

function Medallion({ big = false }: { big?: boolean }) {
  return (
    <div className={`mx-auto flex shrink-0 items-center justify-center rounded-full text-center font-bold leading-tight shadow ${big ? "h-14 w-14 text-[9px]" : "h-10 w-10 text-[7px]"}`}
      style={{ background: GOLD, color: CREAM, border: `2px solid ${CREAM}` }}>
      Золотая<br />лоза
    </div>
  );
}

function BookReviews() {
  const PER = 9;
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const v = useV();

  const load = useCallback(() => {
    fetch("/api/reviews").then((r) => r.json()).then(setReviews).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function vote(id: number, value: number) {
    setMessage("");
    const res = await fetch(`/api/reviews/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grapes: value }),
    });
    if (res.status === 401) {
      setMessage(v("Войдите, чтобы оценивать рецензии", "Войди, чтобы оценивать рецензии"));
      return;
    }
    if (!res.ok) {
      setMessage((await res.text()).trim());
      return;
    }
    load();
  }

  const pages = Math.ceil(reviews.length / PER);
  const shown = reviews.slice(page * PER, page * PER + PER);
  const open = reviews.find((r) => r.id === openId) ?? null;

  return (
    <>
      {reviews.length === 0 ? (
        <p className="flex-1 pt-6 text-center font-sans text-sm opacity-60">{v("Рецензий пока нет. Найдите книгу ниже и напишите первую.", "Рецензий пока нет. Найди книгу ниже и напиши первую.")}</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-3 gap-2">
          {shown.map((r, i) => {
            const kraft = i % 2 === 0;
            return (
              <button key={r.id} onClick={() => setOpenId(r.id)}
                className="flex min-h-0 flex-col gap-1 overflow-hidden rounded-sm p-2 text-left shadow-md"
                style={{ background: kraft ? KRAFT : CREAM }}>
                <div className="flex shrink-0 justify-center">
                  {r.plaque ? <Medallion /> : kraft ? <Art level={level(r)} /> : <GrapeRow level={level(r)} size={9} />}
                </div>
                <p className="line-clamp-4 text-[10px] italic leading-tight">«{r.text}»</p>
                <p className="mt-auto truncate font-sans text-[9px] opacity-60">{r.author}</p>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-2"><Pager page={page} pages={pages} set={setPage} /></div>
      <BookSearch onPick={(id) => router.push(`/book/${id}`)} />

      {/* a review in full: text, level, voting, the way to its book */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setOpenId(null)}>
          <div className="max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl p-5 text-black" style={{ background: CREAM }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                {open.plaque && <Medallion big />}
                <p className="mt-2 text-xl" style={{ color: WINE }}>«{open.book}»</p>
                <p className="font-sans text-xs opacity-60">{open.author}, {day(open.created_at)}</p>
              </div>
              <button onClick={() => setOpenId(null)} className="font-sans text-2xl opacity-50" aria-label="Закрыть">×</button>
            </div>
            <p className="mt-4 text-lg italic">«{open.text}»</p>
            <p className="mt-3 flex items-center gap-2 font-sans text-xs">
              <GrapeRow level={level(open)} />
              {open.votes > 0 ? `${GRAPE_NAMES[level(open)]} · оценок: ${open.votes}` : "Ещё не оценено"}
            </p>
            {!open.mine && (
              <div className="mt-4 grid grid-cols-5 gap-1 font-sans text-[10px]">
                {[1, 2, 3, 4, 5].map((g) => (
                  <button key={g} onClick={() => vote(open.id, g)}
                    className="flex flex-col items-center gap-1 rounded-md border px-1 py-2"
                    style={open.my_vote === g ? { background: WINE, color: CREAM, borderColor: WINE } : { borderColor: "rgba(0,0,0,0.2)" }}>
                    <GrapeRow level={g} size={6} />
                    {GRAPE_NAMES[g]}
                  </button>
                ))}
              </div>
            )}
            {message && <p className="mt-2 font-sans text-sm" style={{ color: WINE }}>{message}</p>}
            <Link href={`/book/${open.product_id}`} className="mt-4 inline-block rounded-full px-5 py-2 font-sans text-sm" style={{ background: WINE, color: CREAM }}>
              К книге →
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

// the search bar: suggestions as you type, the chosen book opens its page
function BookSearch({ onPick }: { onPick: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<BookHit[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/books/find?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()).then(setHits).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative mt-2 shrink-0">
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 bottom-full mb-1 max-h-60 overflow-y-auto rounded-md shadow-lg" style={{ background: CREAM }}>
          {hits.map((h) => (
            <li key={h.id}>
              <button onClick={() => onPick(h.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-black/5">
                {h.cover ? <img src={h.cover} alt="" className="h-10 w-7 rounded-sm object-cover" /> : <span className="h-10 w-7 rounded-sm" style={{ background: KRAFT }} />}
                <span className="min-w-0">
                  <span className="block truncate">{h.name}</span>
                  {h.author && <span className="block truncate font-sans text-xs opacity-60">{h.author}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти книгу и её рецензии" className={input} />
    </div>
  );
}

function ServiceReviews() {
  const PER = 3;
  const [reviews, setReviews] = useState<ServiceReview[]>([]);
  const [orders, setOrders] = useState<OrderRef[] | null>(null); // null = not logged in
  const [page, setPage] = useState(0);
  const [writing, setWriting] = useState(false);
  const [order, setOrder] = useState<number | "">("");
  const [score, setScore] = useState(0);
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const v = useV();

  const load = useCallback(() => {
    fetch("/api/service-reviews").then((r) => r.json()).then(setReviews).catch(() => {});
    fetch("/api/me/reviewable-orders").then((r) => (r.ok ? r.json() : null)).then(setOrders).catch(() => setOrders(null));
  }, []);
  useEffect(load, [load]);

  async function submit() {
    setMessage("");
    const res = await fetch("/api/service-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: order, grapes: score, text }),
    });
    if (!res.ok) {
      setMessage((await res.text()).trim());
      return;
    }
    setMessage("Спасибо! Отзыв появится после модерации.");
    setText(""); setScore(0); setOrder(""); setWriting(false);
    load();
  }

  const pages = Math.ceil(reviews.length / PER);
  const shown = reviews.slice(page * PER, page * PER + PER);

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
      {/* who we are: static, where the big box sits in the mockup */}
      <section className="overflow-hidden rounded-md shadow-md" style={{ background: CREAM }}>
        <img src="/team/box.jpg" alt="" className="h-40 w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
        <AboutUs />
        <div className="p-4">
          <p className="text-xl" style={{ color: WINE }}>{TEAM_TITLE}</p>
          <p className="mt-1 leading-snug">{TEAM_TEXT}</p>
        </div>
      </section>

      {reviews.length === 0 ? (
        <p className="px-1 font-sans text-sm opacity-60">{v("Отзывов о доставке пока нет. Ваш может быть первым.", "Отзывов о доставке пока нет. Твой может быть первым.")}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.id} className="rounded-md p-4 shadow-sm" style={{ background: CREAM }}>
              <GrapeRow level={r.grapes} />
              <p className="mt-2 italic leading-snug" style={{ color: WINE }}>«{r.text}»</p>
              <p className="mt-2 font-sans text-xs opacity-60">{r.author}, {day(r.at)}</p>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={pages} set={setPage} />

      {orders === null && <p className="px-1 font-sans text-sm opacity-60">{v("Войдите в профиле, чтобы оставить отзыв о доставке.", "Войди в профиле, чтобы оставить отзыв о доставке.")}</p>}
      {orders !== null && orders.length > 0 && !writing && (
        <button onClick={() => setWriting(true)} className="w-full rounded-md py-2 font-sans shadow-md" style={{ background: WINE, color: CREAM }}>
          Оставить отзыв о доставке
        </button>
      )}
      {writing && orders && (
        <div className="space-y-2 rounded-md p-4 shadow-md" style={{ background: CREAM }}>
          <select value={order} onChange={(e) => setOrder(e.target.value ? Number(e.target.value) : "")} className={input}>
            <option value="">Какой заказ?</option>
            {orders.map((o) => <option key={o.id} value={o.id}>№{o.id} от {day(o.created_at)}</option>)}
          </select>
          <div className="grid grid-cols-5 gap-1 font-sans text-[10px]">
            {[1, 2, 3, 4, 5].map((g) => (
              <button key={g} onClick={() => setScore(g)} className="flex flex-col items-center gap-1 rounded-md border px-1 py-2"
                style={score === g ? { background: WINE, color: CREAM, borderColor: WINE } : { borderColor: "rgba(0,0,0,0.2)" }}>
                <GrapeRow level={g} size={6} />
                {GRAPE_NAMES[g]}
              </button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={4}
            placeholder={v("Расскажите, как всё прошло", "Расскажи, как всё прошло")} className={input} />
          <div className="flex items-center justify-between font-sans text-sm">
            <span className="opacity-60">{text.length}/300</span>
            <button onClick={submit} disabled={order === "" || score === 0 || text.trim().length < 10}
              className="rounded-full px-5 py-2 disabled:opacity-40" style={{ background: WINE, color: CREAM }}>Отправить</button>
          </div>
        </div>
      )}
      {message && <p className="px-1 font-sans text-sm" style={{ color: WINE }}>{message}</p>}
      <div className="pb-2"><Disclaimer /></div>
    </div>
  );
}
