"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useV } from "@/lib/address";
import { plural } from "@/components/Vintorina";

type Row = { word: string; marks: string };
type State = {
  length: number; base: number; state: "none" | "new" | "playing" | "done";
  rows: Row[]; attempts_left: number; score: number; solved: boolean;
  answer?: string; book?: { id: number; name: string };
};

const WINE = "#57030d";
const CREAM = "#f4ead6";
const COLORS: Record<string, string> = { g: "#5b7f3a", y: "#c99a2e", b: "#8a817c" };
const RANK: Record<string, number> = { b: 1, y: 2, g: 3 };
const KEYS = ["йцукенгшщзхъ", "фывапролджэ", "ячсмитьбю"];
const kniv = (n: number) => `${n} ${plural(n, ["книвиночка", "книвиночки", "книвиночек"])}`;

export default function Bukvin() {
  const v = useV();
  const [s, setS] = useState<State | null>(null);
  const [guest, setGuest] = useState(false);
  const [cur, setCur] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/bukvin/today");
    if (r.status === 401) {
      setGuest(true);
      return;
    }
    if (r.ok) setS(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function post(path: string, body?: object) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`/api/bukvin/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!r.ok) {
        setMsg((await r.text()).trim());
        return false;
      }
      setS(await r.json());
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!s || cur.length !== s.length || busy) return;
    if (await post("guess", { word: cur })) setCur("");
  }

  function press(k: string) {
    if (!s || s.state !== "playing" || busy) return;
    setMsg("");
    if (k === "⌫") setCur((c) => c.slice(0, -1));
    else if (k === "✓") submit();
    else setCur((c) => (c.length < s.length ? c + k : c));
  }

  // a physical keyboard works too
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase().replace("ё", "е");
      if (k === "backspace") press("⌫");
      else if (k === "enter") press("✓");
      else if (/^[а-я]$/.test(k)) press(k);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (guest) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg">{v("Играть можно после входа через Telegram: так мы сохраним Ваши книвиночки.", "Играть можно после входа через Telegram: так мы сохраним твои книвиночки.")}</p>
        <Link href="/account" className="rounded-full px-6 py-2 font-sans" style={{ background: WINE, color: CREAM }}>Войти</Link>
      </div>
    );
  }
  if (!s) return <div className="flex-1" />;
  if (s.state === "none") {
    return <p className="flex-1 pt-10 text-center">{v("Слово дня ещё не загадано. Загляните позже.", "Слово дня ещё не загадано. Загляни позже.")}</p>;
  }
  if (s.state === "new") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-2xl" style={{ color: WINE }}>Буквин</p>
        <p className="font-sans text-sm">слово из {s.length} букв · до {kniv(s.base)}</p>
        <div className="space-y-1 text-[15px] leading-snug">
          <p>Литературное слово дня и шесть попыток.</p>
          <p>Зелёная буква на своём месте, жёлтая есть в слове, но не здесь, серой нет вовсе.</p>
          <p>Чем быстрее и с меньшего числа попыток, тем больше книвиночек.</p>
        </div>
        <button onClick={() => post("start")} disabled={busy}
          className="rounded-full px-10 py-3 text-xl shadow-md disabled:opacity-40" style={{ background: WINE, color: CREAM }}>
          Начать
        </button>
      </div>
    );
  }

  // the best colour each letter has earned so far, for the keyboard
  const letters: Record<string, string> = {};
  for (const r of s.rows) {
    [...r.word].forEach((ch, i) => {
      const m = r.marks[i];
      if (!letters[ch] || RANK[m] > RANK[letters[ch]]) letters[ch] = m;
    });
  }

  const playing = s.state === "playing";
  const grid = Array.from({ length: 6 }, (_, i) =>
    i < s.rows.length ? s.rows[i] : i === s.rows.length && playing ? { word: cur, marks: "" } : { word: "", marks: "" });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* the grid: six rows of the word's length */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="grid w-full gap-1.5" style={{ maxWidth: s.length * 48, gridTemplateRows: "repeat(6, auto)" }}>
          {grid.map((row, ri) => (
            <div key={ri} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${s.length}, minmax(0, 1fr))` }}>
              {Array.from({ length: s.length }, (_, ci) => {
                const ch = [...row.word][ci] ?? "";
                const m = row.marks[ci];
                return (
                  <div key={ci} className="flex aspect-square items-center justify-center rounded-md border text-xl font-semibold uppercase"
                    style={m ? { background: COLORS[m], borderColor: COLORS[m], color: "#fff" } : { borderColor: ch ? WINE : "rgba(0,0,0,0.2)" }}>
                    {ch}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {msg && <p className="shrink-0 text-center font-sans text-sm" style={{ color: WINE }}>{msg}</p>}

      {playing ? (
        <div className="shrink-0 space-y-1.5">
          {KEYS.map((row, i) => (
            <div key={i} className="flex justify-center gap-1">
              {i === 2 && <Key label="⌫" wide onPress={press} />}
              {[...row].map((k) => <Key key={k} label={k} mark={letters[k]} onPress={press} />)}
              {i === 2 && <Key label="✓" wide onPress={press} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="shrink-0 space-y-2 rounded-md p-3 text-center shadow-sm" style={{ background: CREAM }}>
          <p className="text-2xl" style={{ color: WINE }}>{s.solved ? `+${kniv(s.score)}` : "0 книвиночек"}</p>
          <p>Слово: <span className="font-semibold uppercase">{s.answer}</span></p>
          {s.book && (
            <Link href={`/book/${s.book.id}`} className="inline-block rounded-full px-4 py-1.5 font-sans text-sm" style={{ background: WINE, color: CREAM }}>
              «{s.book.name}» →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Key({ label, mark, wide, onPress }: { label: string; mark?: string; wide?: boolean; onPress: (k: string) => void }) {
  return (
    <button onClick={() => onPress(label)}
      className={`flex h-11 items-center justify-center rounded-md font-sans text-sm font-semibold uppercase ${wide ? "w-11" : "w-[7.5%] min-w-0"}`}
      style={mark ? { background: COLORS[mark], color: "#fff" } : { background: "rgba(0,0,0,0.12)", color: "#1a1a1a" }}>
      {label}
    </button>
  );
}

