"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { plural } from "@/components/Vintorina";
import { useV } from "@/lib/address";

type Result = { played: boolean; tile: number; prize?: string; name?: string; score: number; board?: string[] };

const WINE = "#57030d";
const CREAM = "#f4ead6";
// prize → picture in public/grapes, and its value (keep in step with razvinPrizes in razvin.go)
const PRIZES = [
  { code: "leaf", img: 1, points: 10 },
  { code: "set", img: 2, points: 30 },
  { code: "ripening", img: 3, points: 75 },
  { code: "cluster", img: 4, points: 200 },
  { code: "gold", img: 5, points: 1000 },
];
const kniv = (n: number) => `${n} ${plural(n, ["книвиночка", "книвиночки", "книвиночек"])}`;

function PrizeIcon({ code, className = "size-[75%]" }: { code: string; className?: string }) {
  const p = PRIZES.find((x) => x.code === code) ?? PRIZES[0];
  return <img src={`/grapes/${p.img}.png`} alt="" className={`${className} object-contain`} />;
}

export default function Razvin() {
  const v = useV();
  const [r, setR] = useState<Result | null>(null);
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false); // the whole field, opened after the tap

  const load = useCallback(async () => {
    const res = await fetch("/api/razvin/today");
    if (res.status === 401) {
      setGuest(true);
      return;
    }
    if (res.ok) setR(await res.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function tap(tile: number) {
    if (!r || r.played || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/razvin/tap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tile }),
      });
      if (res.ok) setR(await res.json());
    } finally {
      setBusy(false);
    }
  }

  if (guest) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg">{v("Играть можно после входа через Telegram: так мы сохраним Ваши книвиночки.", "Играть можно после входа через Telegram: так мы сохраним твои книвиночки.")}</p>
        <Link href="/account" className="rounded-full px-6 py-2 font-sans" style={{ background: WINE, color: CREAM }}>Войти</Link>
      </div>
    );
  }
  if (!r) return <div className="flex-1" />;

  const board = r.played && shown ? r.board : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-center text-lg">
        {r.played ? `${r.name}: +${kniv(r.score)}` : "Одно касание в день. Что под плиточкой?"}
      </p>

      {/* the vineyard: 6 × 8 tiles, as large as the screen allows */}
      <div className="flex min-h-0 flex-1 justify-center">
        <div className="grid aspect-[6/8] h-full max-w-full grid-cols-6 grid-rows-8 gap-1">
          {Array.from({ length: 48 }, (_, i) => {
            const mine = r.played && r.tile === i;
            return (
              <button key={i} disabled={r.played || busy} onClick={() => tap(i)}
                className={`flex items-center justify-center rounded-md border transition ${mine ? "motion-safe:animate-swoop" : board ? "" : r.played ? "opacity-40" : "active:scale-95"}`}
                style={{
                  background: mine ? CREAM : board ? "#dcc7a3" : "#c9a77a",
                  borderColor: mine && board ? WINE : "rgba(0,0,0,0.25)",
                  borderWidth: mine && board ? 2 : 1,
                }}>
                {mine && r.prize ? <PrizeIcon code={r.prize} /> : board ? <PrizeIcon code={board[i]} className="size-[70%] opacity-80" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {r.played && r.board && (
        <button onClick={() => setShown((s) => !s)} className="shrink-0 rounded-md py-2 font-sans text-sm shadow-md" style={{ background: WINE, color: CREAM }}>
          {shown ? "Скрыть поле" : "Показать всё поле"}
        </button>
      )}

      {/* what can be found, and what it's worth */}
      <div className="grid shrink-0 grid-cols-5 gap-1">
        {PRIZES.map((p) => (
          <div key={p.code} className="flex flex-col items-center">
            <PrizeIcon code={p.code} className="h-9 w-9" />
            <span className="font-sans text-[10px]">{p.points}</span>
          </div>
        ))}
      </div>

      <p className="shrink-0 text-center font-sans text-xs opacity-70">
        {r.played ? "Следующее касание завтра · " : ""}
        <Link href="/legal/games" className="underline">Шансы и правила</Link>
      </p>
    </div>
  );
}
