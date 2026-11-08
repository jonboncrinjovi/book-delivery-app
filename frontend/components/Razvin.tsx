"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GrapeRow } from "@/components/GrapeRow";
import { plural } from "@/components/Vintorina";
import { useV } from "@/lib/address";

type Result = { played: boolean; tile: number; prize?: string; name?: string; score: number };

const WINE = "#57030d";
const CREAM = "#f4ead6";
const LEVEL: Record<string, number> = { leaf: 1, blossom: 2, set: 3, ripening: 4, cluster: 5 };
const kniv = (n: number) => `${n} ${plural(n, ["книвиночка", "книвиночки", "книвиночек"])}`;

// your grape-stage picture if it exists, otherwise the row of berries
function PrizeArt({ level }: { level: number }) {
  const [ok, setOk] = useState(true);
  return ok
    ? <img src={`/grapes/${level}.png`} alt="" onError={() => setOk(false)} className="size-[70%] object-contain" />
    : <GrapeRow level={level} size={6} />;
}

function PrizeIcon({ code }: { code: string }) {
  if (code === "gold") {
    return (
      <div className="flex size-[80%] items-center justify-center rounded-full text-center text-[7px] font-bold leading-tight shadow"
        style={{ background: "#b8892d", color: CREAM, border: `2px solid ${CREAM}` }}>
        Золотая<br />лоза
      </div>
    );
  }
  return <PrizeArt level={LEVEL[code] ?? 1} />;
}

export default function Razvin() {
  const v = useV();
  const [r, setR] = useState<Result | null>(null);
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-center text-lg">
        {r.played ? `${r.name}: +${kniv(r.score)}` : "Одно касание в день. Что под листом?"}
      </p>

      {/* the vineyard: 6 × 8 tiles, as large as the screen allows */}
      <div className="flex min-h-0 flex-1 justify-center">
        <div className="grid aspect-[6/8] h-full max-w-full grid-cols-6 grid-rows-8 gap-1">
          {Array.from({ length: 48 }, (_, i) => {
            const mine = r.played && r.tile === i;
            return (
              <button key={i} disabled={r.played || busy} onClick={() => tap(i)}
                className={`flex items-center justify-center rounded-md border transition ${mine ? "motion-safe:animate-swoop" : r.played ? "opacity-40" : "active:scale-95"}`}
                style={{ background: mine ? CREAM : "#c9a77a", borderColor: "rgba(0,0,0,0.25)" }}>
                {mine && r.prize && <PrizeIcon code={r.prize} />}
              </button>
            );
          })}
        </div>
      </div>

      <p className="shrink-0 text-center font-sans text-xs opacity-70">
        {r.played ? "Следующее касание завтра · " : ""}
        <Link href="/legal/games" className="underline">Шансы и правила</Link>
      </p>
    </div>
  );
}
