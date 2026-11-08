"use client";

import { useEffect, useRef, useState } from "react";
import { useV } from "@/lib/address";

type Item = { id: number; name: string; book: string; details: string; product_id: number | null };
type Result = { item_id: number; median: number; mean: number };
type Obzor = { id: number; question: string; opens_at: string; closes_at: string; open: boolean; items: Item[]; votes: number; results: Result[] | null; mine: number[] | null };
type Brief = { id: number; question: string; closes_at: string; votes: number };
type Comment = { author: string; text: string };

const WINE = "#57030d";
const CREAM = "#f4ead6";
const INK = "#2a1a14";
const input = "w-full rounded-md border border-black/20 bg-white p-3 font-sans text-[15px] outline-none focus:border-[#57030d]";

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
const fmtMedian = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1).replace(".", ","));
// closes_at is midnight after the last day, so show the day before it
const lastDay = (s: string) => new Date(Date.parse(s) - 1).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });

export default function ObzorPage() {
  const [mode, setMode] = useState<"current" | "archive">("current");
  const [archiveId, setArchiveId] = useState<number | null>(null);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {mode === "current" ? (
        <>
          <Current />
          <button onClick={() => setMode("archive")} className="mt-3 w-full font-sans text-sm underline" style={{ color: WINE }}>Архив обзоров</button>
        </>
      ) : archiveId ? (
        <>
          <button onClick={() => setArchiveId(null)} className="mb-2 font-sans text-sm" style={{ color: WINE }}>‹ Архив</button>
          <ArchiveEntry id={archiveId} />
        </>
      ) : (
        <>
          <button onClick={() => setMode("current")} className="mb-2 font-sans text-sm" style={{ color: WINE }}>‹ Обзор недели</button>
          <ArchiveList onOpen={setArchiveId} />
        </>
      )}
    </div>
  );
}

function Current() {
  const [o, setO] = useState<Obzor | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/obzor/current")
      .then(async (r) => setO(r.status === 200 ? await r.json() : null))
      .catch(() => setO(null));
  }, []);
  if (o === undefined) return null;
  if (o === null) return <p className="pt-6 text-center font-sans text-sm opacity-60">Новый обзор скоро.</p>;
  return <ObzorCard key={o.id} o={o} onChange={setO} />;
}

function ObzorCard({ o, onChange }: { o: Obzor; onChange: (o: Obzor) => void }) {
  const [editing, setEditing] = useState(o.open && !o.mine);
  const [info, setInfo] = useState<Item | null>(null);
  const byId: Record<number, Item> = Object.fromEntries(o.items.map((i) => [i.id, i]));
  return (
    <section className="rounded-md p-4 shadow-sm" style={{ background: CREAM, color: INK }}>
      <p className="text-xl leading-tight" style={{ color: WINE }}>{o.question}</p>
      <p className="mt-1 font-sans text-xs opacity-60">
        {o.open ? `Голосование до ${lastDay(o.closes_at)}` : `Итоги на ${lastDay(o.closes_at)}`} · Голосов: {o.votes}
      </p>
      {editing
        ? <Ranker o={o} byId={byId} onInfo={setInfo} onSaved={(n) => { onChange(n); setEditing(false); }} />
        : <Results o={o} byId={byId} onInfo={setInfo} onEdit={o.open ? () => setEditing(true) : undefined} />}
      {info && <Dossier item={info} onClose={() => setInfo(null)} />}
    </section>
  );
}

// tap a name for the dossier; long-press and drag to reorder; the top is the most irredeemable
function Ranker({ o, byId, onInfo, onSaved }: { o: Obzor; byId: Record<number, Item>; onInfo: (i: Item) => void; onSaved: (o: Obzor) => void }) {
  const v = useV();
  const [order, setOrder] = useState<number[]>(() => o.mine ?? shuffle(o.items.map((i) => i.id)));
  const [drag, setDrag] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const press = useRef<{ id: number; x: number; y: number; moved: boolean; dragging: boolean; timer: ReturnType<typeof setTimeout> } | null>(null);

  function down(e: React.PointerEvent, id: number) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = { id, x: e.clientX, y: e.clientY, moved: false, dragging: false, timer: 0 as unknown as ReturnType<typeof setTimeout> };
    p.timer = setTimeout(() => {
      if (press.current === p) {
        p.dragging = true;
        setDrag(id);
        navigator.vibrate?.(15);
      }
    }, 350);
    press.current = p;
  }

  function move(e: React.PointerEvent) {
    const p = press.current;
    if (!p) return;
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) {
        p.moved = true;
        clearTimeout(p.timer);
      }
      return;
    }
    const rows = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    let target = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        target = i;
        break;
      }
    }
    setOrder((cur) => {
      const from = cur.indexOf(p.id);
      if (from === target) return cur;
      const n = [...cur];
      n.splice(from, 1);
      n.splice(target, 0, p.id);
      return n;
    });
  }

  function up(cancelled: boolean) {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (p.dragging) setDrag(null);
    else if (!p.moved && !cancelled) onInfo(byId[p.id]);
  }

  async function submit() {
    setMsg("");
    const r = await fetch(`/api/obzor/${o.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
    if (r.status === 401) {
      setMsg(v("Войдите через Telegram, чтобы голосовать.", "Войди через Telegram, чтобы голосовать."));
      return;
    }
    if (!r.ok) {
      setMsg((await r.text()).trim());
      return;
    }
    onSaved(await r.json());
  }

  return (
    <>
      <p className="mt-2 font-sans text-xs opacity-70">
        {v("Нажмите на имя — откроется досье. Удерживайте и перетаскивайте, чтобы расставить: наверху — самый неисправимый.",
           "Нажми на имя — откроется досье. Удерживай и перетаскивай, чтобы расставить: наверху — самый неисправимый.")}
      </p>
      <ol ref={listRef} className="mt-2 space-y-1">
        {order.map((id, idx) => {
          const it = byId[id];
          const d = drag === id;
          return (
            <li key={id}
              onPointerDown={(e) => down(e, id)} onPointerMove={move}
              onPointerUp={() => up(false)} onPointerCancel={() => up(true)}
              onContextMenu={(e) => e.preventDefault()}
              className={`flex cursor-grab select-none items-center gap-3 rounded-md border px-3 py-1.5 transition-transform ${d ? "scale-[1.02] shadow-lg" : ""}`}
              style={{ touchAction: "none", WebkitTouchCallout: "none", background: d ? "#fff" : "transparent", borderColor: d ? WINE : "rgba(0,0,0,0.15)" }}>
              <span className="w-5 shrink-0 text-right font-sans text-sm opacity-60">{idx + 1}</span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate">{it.name}</span>
                <span className="block truncate font-sans text-[11px] opacity-60">{it.book}</span>
              </span>
              <span aria-hidden className="font-sans text-lg leading-none opacity-30">⋮⋮</span>
            </li>
          );
        })}
      </ol>
      <button onClick={submit} className="mt-3 w-full rounded-full py-2.5 font-sans" style={{ background: WINE, color: CREAM }}>Отправить</button>
      {msg && <p className="mt-2 font-sans text-sm" style={{ color: WINE }}>{msg}</p>}
    </>
  );
}

function Results({ o, byId, onInfo, onEdit }: { o: Obzor; byId: Record<number, Item>; onInfo: (i: Item) => void; onEdit?: () => void }) {
  const v = useV();
  const res = o.results ?? [];
  return (
    <>
      {res.length === 0 ? (
        <p className="mt-3 font-sans text-sm opacity-60">Голосов пока нет.</p>
      ) : (
        <ol className="mt-3 space-y-0.5">
          {res.map((x, idx) => {
            const it = byId[x.item_id];
            const mine = o.mine ? o.mine.indexOf(x.item_id) + 1 : 0;
            return (
              <li key={x.item_id}>
                <button onClick={() => it && onInfo(it)} className="flex w-full items-center gap-3 rounded-md px-1 py-1 text-left">
                  <span className="w-5 shrink-0 text-right font-sans text-sm opacity-60">{idx + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{it?.name}</span>
                  <span className="shrink-0 font-sans text-xs opacity-70">
                    медиана {fmtMedian(x.median)}{mine ? ` · ${v("у Вас", "у тебя")} ${mine}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-2 font-sans text-[11px] opacity-60">
        Медиана — место, выше и ниже которого персонажа поставило поровну проголосовавших.
      </p>
      {(o.mine || !o.open) && <Books o={o} byId={byId} />}
      {onEdit && (
        <button onClick={onEdit} className="mt-2 font-sans text-sm underline" style={{ color: WINE }}>Изменить порядок</button>
      )}
    </>
  );
}

// "did you recognise them all?": each book once, those of the top-ranked first; catalogue page if it's there, otherwise search
function Books({ o, byId }: { o: Obzor; byId: Record<number, Item> }) {
  const v = useV();
  const ids = [...(o.results ?? []).map((x) => x.item_id), ...o.items.map((i) => i.id)];
  const books = new Map<string, Item>();
  for (const id of ids) {
    const it = byId[id];
    if (!it || !it.book) continue;
    const prev = books.get(it.book);
    if (!prev || (!prev.product_id && it.product_id)) books.set(it.book, it);
  }
  if (books.size === 0) return null;
  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: "rgba(0,0,0,0.15)" }}>
      <p className="text-lg" style={{ color: WINE }}>
        {v("Всех узнали? Если нет — вот книги:", "Все лица знакомы? Если нет — вот книги:")}
      </p>
      <ul className="mt-2 space-y-1.5">
        {[...books.values()].map((it) => {
          const [title, author] = it.book.split(", ");
          const href = it.product_id ? `/book/${it.product_id}` : `/search?q=${encodeURIComponent(title.replace(/[«»]/g, ""))}`;
          return (
            <li key={it.book}>
              <a href={href} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                style={{ borderColor: "rgba(0,0,0,0.15)" }}>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate">{title}</span>
                  {author && <span className="block truncate font-sans text-[11px] opacity-60">{author}</span>}
                </span>
                <span className="shrink-0 font-sans text-sm" style={{ color: WINE }}>
                  {it.product_id ? "Купить ›" : "Найти ›"}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Dossier({ item, onClose }: { item: Item; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-md p-5 shadow-xl"
        style={{ background: CREAM, color: INK }} onClick={(e) => e.stopPropagation()}>
        <p className="text-2xl leading-tight" style={{ color: WINE }}>{item.name}</p>
        <p className="font-sans text-sm opacity-60">{item.book}</p>
        {item.details.split("\n").filter(Boolean).map((p, i) => (
          <p key={i} className="mt-3 leading-snug">{p}</p>
        ))}
        <button onClick={onClose} className="mt-4 w-full rounded-full py-2 font-sans" style={{ background: WINE, color: CREAM }}>Закрыть</button>
      </div>
    </div>
  );
}

function ArchiveList({ onOpen }: { onOpen: (id: number) => void }) {
  const [list, setList] = useState<Brief[] | null>(null);
  useEffect(() => {
    fetch("/api/obzor/archive").then((r) => r.json()).then(setList).catch(() => setList([]));
  }, []);
  if (!list) return null;
  if (list.length === 0) return <p className="pt-6 text-center font-sans text-sm opacity-60">Архив пока пуст: первый обзор ещё идёт.</p>;
  return (
    <ul className="space-y-2">
      {list.map((b) => (
        <li key={b.id}>
          <button onClick={() => onOpen(b.id)} className="w-full rounded-md p-3 text-left shadow-sm" style={{ background: CREAM, color: INK }}>
            <span className="block" style={{ color: WINE }}>{b.question}</span>
            <span className="block font-sans text-xs opacity-60">{lastDay(b.closes_at)} · Голосов: {b.votes}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ArchiveEntry({ id }: { id: number }) {
  const [o, setO] = useState<Obzor | null>(null);
  useEffect(() => {
    fetch(`/api/obzor/${id}`).then((r) => r.json()).then(setO).catch(() => {});
  }, [id]);
  if (!o) return null;
  return (
    <div className="space-y-3">
      <ObzorCard o={o} onChange={setO} />
      <Comments obzorId={o.id} />
    </div>
  );
}

function Comments({ obzorId }: { obzorId: number }) {
  const v = useV();
  const [list, setList] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/obzor/${obzorId}/comments`).then((r) => r.json()).then(setList).catch(() => {});
  }, [obzorId]);

  async function send() {
    setMsg("");
    const r = await fetch(`/api/obzor/${obzorId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (r.status === 401) {
      setMsg(v("Войдите через Telegram, чтобы оставить комментарий.", "Войди через Telegram, чтобы оставить комментарий."));
      return;
    }
    if (!r.ok) {
      setMsg((await r.text()).trim());
      return;
    }
    setText("");
    setMsg("Спасибо! Комментарий появится после модерации.");
  }

  return (
    <section className="space-y-2">
      <p className="text-lg" style={{ color: WINE }}>Комментарии</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={2}
        placeholder={v("Согласны с итогом? Кого не хватило?", "Согласен с итогом? Кого не хватило?")} className={input} />
      <div className="flex items-center justify-between font-sans text-sm">
        <span className="opacity-60">{text.length}/300</span>
        <button onClick={send} disabled={text.trim().length < 3}
          className="rounded-full px-5 py-2 disabled:opacity-40" style={{ background: WINE, color: CREAM }}>Отправить</button>
      </div>
      {msg && <p className="font-sans text-sm" style={{ color: WINE }}>{msg}</p>}
      <ul className="space-y-2">
        {list.map((c, i) => (
          <li key={i} className="rounded-md p-3 shadow-sm" style={{ background: CREAM, color: INK }}>
            <p className="leading-snug">{c.text}</p>
            <p className="mt-1 font-sans text-xs opacity-60">{c.author}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
