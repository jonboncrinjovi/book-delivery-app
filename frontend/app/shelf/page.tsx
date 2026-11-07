"use client";

import { useEffect, useState } from "react";
import ShelfView from "@/components/ShelfView";
import Vintorina from "@/components/Vintorina";

const WINE = "#57030d";
const CREAM = "#f4ead6";

// «Мои книги»: the shelf, and the game next to it. /shelf?tab=game opens straight on the game (for links from the channel)
export default function ShelfPage() {
  const [tab, setTab] = useState<"shelf" | "game">("shelf");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "game") setTab("game");
  }, []);
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid shrink-0 grid-cols-2 gap-3">
        {(["shelf", "game"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md py-2 text-lg shadow-md transition-opacity ${tab === t ? "" : "opacity-60"}`}
            style={{ background: WINE, color: CREAM }}>
            {t === "shelf" ? "Полка" : "Винторина"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === "shelf" ? <ShelfView /> : <Vintorina />}</div>
    </div>
  );
}
