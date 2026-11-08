"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useV } from "@/lib/address";
import { addToShelf } from "@/lib/shelf";

type Book = { id: number; name: string; cover: string | null };
type Puzzle = {
  id: number; slot: number; base: number; state: "new" | "playing" | "done"; score: number;
  image?: string; line?: string; hint?: string; guesses_left: number; seconds_left: number;
  answer?: string; book?: Book;
};
type TopRow = { nickname: string; total: number };
type Me = { nickname: string | null; show_in_top: boolean; total: number };

const WINE = "#57030d";
const CREAM = "#f4ead6";
const input = "w-full rounded-md border border-black/20 bg-white p-3 font-sans text-[15px] outline-none focus:border-[#57030d]";
const chosen = (on: boolean) => (on ? { background: WINE, color: CREAM, borderColor: WINE } : { borderColor: "rgba(0,0,0,0.2)" });

// Russian needs three forms: 1 книвиночка, 2 книвиночки, 5 книвиночек (and 21 книвиночка, 11 книвиночек)
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b > 1 && b < 5) return forms[1];
  return forms[2];
}
const kniv = (n: number) => `${n} ${plural(n, ["книвиночка", "книвиночки", "книвиночек"])}`;

export default function Vintorina() {
  const [view, setView] = useState<"game" | "top">("game");
  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden rounded-xl bg-[#e9e2d3] p-3 text-black">
      <div className="grid shrink-0 grid-cols-2 gap-2 font-sans text-sm">
        {(["game", "top"] as const).map((t) => (
          <button key={t} onClick={() => setView(t)} className="rounded-md border py-1.5" style={chosen(view === t)}>
            {t === "game" ? "Загадки дня" : "Рейтинг"}
          </button>
        ))}
      </div>
      {view === "game" ? <Game /> : <Top />}
    </div>
  );
}

export function Game() {
  const v = useV();
  const [puzzles, setPuzzles] = useState<Puzzle[] | null>(null);
  const [guest, setGuest] = useState(false);
  const [sel, setSel] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch("/api/vintorina/today");
    if (r.status === 401) {
      setGuest(true);
      return;
    }
    if (r.ok) setPuzzles(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const replace = (p: Puzzle) => setPuzzles((ps) => (ps ? ps.map((x) => (x.id === p.id ? p : x)) : ps));

  if (guest) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg">{v("Играть можно после входа через Telegram: так мы сохраним Ваши книвиночки.", "Играть можно после входа через Telegram: так мы сохраним твои книвиночки.")}</p>
        <Link href="/account" className="rounded-full px-6 py-2 font-sans" style={{ background: WINE, color: CREAM }}>Войти</Link>
      </div>
    );
  }
  if (!puzzles) return <div className="flex-1" />;
  if (puzzles.length === 0) {
    return <p className="flex-1 pt-10 text-center">{v("Сегодняшние загадки ещё в работе. Загляните позже.", "Сегодняшние загадки ещё в работе. Загляни позже.")}</p>;
  }

  const p = puzzles[Math.min(sel, puzzles.length - 1)];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* today's puzzles: played ones show their score */}
      <div className="flex shrink-0 justify-center gap-2 font-sans text-xs">
        {puzzles.map((x, i) => (
          <button key={x.id} onClick={() => setSel(i)} className="rounded-full border px-3 py-1" style={chosen(i === sel)}>
            №{x.slot}{x.state === "done" ? ` · ${x.score}` : x.state === "playing" ? " · идёт" : ""}
          </button>
        ))}
      </div>
      <Round key={p.id} p={p} onChange={replace} onExpire={load} />
    </div>
  );
}

function Round({ p, onChange, onExpire }: { p: Puzzle; onChange: (p: Puzzle) => void; onExpire: () => void }) {
  const v = useV();
  const [answer, setAnswer] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(p.seconds_left);
  const [shelved, setShelved] = useState(false);

  // the visible clock; the real one is on the server. At zero, wait out its grace, then fetch the result
  useEffect(() => {
    if (p.state !== "playing") return;
    const end = Date.now() + p.seconds_left * 1000;
    setLeft(p.seconds_left);
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        clearInterval(t);
        setTimeout(onExpire, 3500);
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.state, p.seconds_left]);

  async function call(action: string, body?: object) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`/api/vintorina/${p.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) {
        setMsg((await r.text()).trim());
        return null;
      }
      const data = await r.json();
      onChange(data);
      return data as Puzzle & { correct?: boolean };
    } finally {
      setBusy(false);
    }
  }

  async function guess() {
    if (!answer.trim() || busy) return;
    const data = await call("guess", { answer });
    setAnswer("");
    if (data && !data.correct && data.state === "playing") setMsg(`Не то. Осталось попыток: ${data.guesses_left}`);
  }

  if (p.state === "new") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-2xl" style={{ color: WINE }}>Загадка №{p.slot}</p>
        <p className="font-sans text-sm">до {kniv(p.base)}</p>
        <div className="space-y-1 text-[15px] leading-snug">
          <p>{v("Картинка и одна строчка: кто, что или где это?", "Картинка и одна строчка: кто, что или где это?")}</p>
          <p>{v("У Вас 60 секунд и три попытки.", "У тебя 60 секунд и три попытки.")}</p>
          <p>Чем быстрее и точнее ответ, тем больше книвиночек. Подсказка делит их пополам.</p>
        </div>
        <button onClick={() => call("start")} disabled={busy}
          className="rounded-full px-10 py-3 text-xl shadow-md disabled:opacity-40" style={{ background: WINE, color: CREAM }}>
          Начать
        </button>
        {msg && <p className="font-sans text-sm" style={{ color: WINE }}>{msg}</p>}
      </div>
    );
  }

  const playing = p.state === "playing";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* the picture takes whatever height is left */}
      <div className="flex min-h-0 flex-1 justify-center">
        {p.image && <img src={p.image} alt="" className="h-full max-w-full rounded-sm object-contain shadow-md" />}
      </div>
      <p className="shrink-0 text-center italic leading-snug">{p.line}</p>
      {p.hint && <p className="shrink-0 text-center font-sans text-xs" style={{ color: WINE }}>{playing ? "Подсказка: " : "Подсказка к загадке: "}{p.hint}</p>}

      {playing ? (
        <div className="shrink-0 space-y-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
            <div className="h-full transition-[width] duration-200"
              style={{ width: `${(left / 60) * 100}%`, background: left <= 10 ? "#c0392b" : WINE }} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); guess(); }} className="flex gap-2">
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={100} autoFocus
              placeholder="Кто, что или где?" className={input} disabled={left === 0} />
            <button disabled={busy || left === 0 || !answer.trim()}
              className="shrink-0 rounded-md px-4 font-sans disabled:opacity-40" style={{ background: WINE, color: CREAM }}>
              Ответ
            </button>
          </form>
          <div className="flex items-center justify-between font-sans text-xs">
            {!p.hint ? (
              <button onClick={() => call("hint")} disabled={busy} className="underline" style={{ color: WINE }}>Подсказка (−50%)</button>
            ) : <span />}
            <span className="opacity-60">{left > 0 ? `${left} с · попыток: ${p.guesses_left}` : "Время вышло…"}</span>
          </div>
          {msg && <p className="text-center font-sans text-sm" style={{ color: WINE }}>{msg}</p>}
        </div>
      ) : (
        <div className="shrink-0 space-y-2 rounded-md p-3 text-center shadow-sm" style={{ background: CREAM }}>
          <p className="text-2xl" style={{ color: WINE }}>{p.score > 0 ? `+${kniv(p.score)}` : "0 книвиночек"}</p>
          <p>Ответ: <span className="font-semibold">{p.answer}</span></p>
          {p.book && (
            <div className="flex justify-center gap-2 font-sans text-sm">
              <Link href={`/book/${p.book.id}`} className="rounded-full px-4 py-1.5" style={{ background: WINE, color: CREAM }}>
                «{p.book.name}» →
              </Link>
              <button disabled={shelved} className="rounded-full border px-4 py-1.5 disabled:opacity-50" style={{ borderColor: WINE, color: WINE }}
                onClick={() => { addToShelf({ id: p.book!.id, name: p.book!.name, cover: p.book!.cover ?? undefined, hidden: false }); setShelved(true); }}>
                {shelved ? "На полке" : "На полку"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Top() {
  const v = useV();
  const [period, setPeriod] = useState<"day" | "month" | "all">("day");
  const [top, setTop] = useState<TopRow[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [nick, setNick] = useState("");
  const [show, setShow] = useState(true);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/vintorina/top?period=${period}`);
    if (!r.ok) return;
    const data = await r.json();
    setTop(data.top);
    setMe(data.me ?? null);
    if (data.me?.nickname) {
      setNick(data.me.nickname);
      setShow(data.me.show_in_top);
    }
  }, [period]);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setMsg("");
    const r = await fetch("/api/vintorina/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nick, show_in_top: show }),
    });
    if (!r.ok) {
      setMsg((await r.text()).trim());
      return;
    }
    setMsg("Сохранено");
    load();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="grid shrink-0 grid-cols-3 gap-2 font-sans text-xs">
        {([["day", "День"], ["month", "Месяц"], ["all", "Всё время"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setPeriod(k)} className="rounded-full border py-1" style={chosen(period === k)}>{label}</button>
        ))}
      </div>

      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {top.length === 0 && <li className="pt-6 text-center font-sans text-sm opacity-60">Пока никого. Первое место свободно.</li>}
        {top.map((row, i) => (
          <li key={row.nickname} className="flex items-center gap-3 rounded-md px-3 py-2" style={{ background: i < 3 ? CREAM : "transparent" }}>
            <span className="w-6 text-right font-sans text-sm opacity-60">{i + 1}</span>
            <span className="flex-1 truncate">{row.nickname}</span>
            <span className="font-sans text-sm">{kniv(row.total)}</span>
          </li>
        ))}
      </ol>

      <div className="shrink-0 space-y-2 rounded-md p-3 font-sans text-sm shadow-sm" style={{ background: CREAM }}>
        {me === null ? (
          <p className="text-center">{v("Войдите через Telegram, чтобы попасть в рейтинг.", "Войди через Telegram, чтобы попасть в рейтинг.")}</p>
        ) : (
          <>
            <p className="text-center">{v("Ваш счёт", "Твой счёт")}: <span className="font-semibold">{kniv(me.total)}</span></p>
            <div className="flex gap-2">
              <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} placeholder="Ник для рейтинга" className={input} />
              <button onClick={save} className="shrink-0 rounded-md px-4" style={{ background: WINE, color: CREAM }}>OK</button>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4 accent-[#57030d]" />
              показывать меня в рейтинге
            </label>
            {msg && <p className="text-center text-xs" style={{ color: WINE }}>{msg}</p>}
          </>
        )}
      </div>
    </div>
  );
}
