"use client";

import { useState } from "react";
import { Game as VintorinaGame, Top } from "@/components/Vintorina";
import Bukvin from "@/components/Bukvin";
import Razvin from "@/components/Razvin";

const WINE = "#57030d";
type Choice = "vintorina" | "bukvin" | "razvin" | "top" | null;

// «Игры»: three cards in the middle of the screen, like «Для себя / В подарок»; the chosen game opens in their place
export default function Games() {
  const [g, setG] = useState<Choice>(null);

  if (g) {
    return (
      <div className="flex h-full flex-col gap-2 overflow-hidden rounded-xl bg-[#e9e2d3] p-3 text-black">
        <button onClick={() => setG(null)} className="shrink-0 self-start font-sans text-sm" style={{ color: WINE }}>← Все игры</button>
        {g === "vintorina" && <VintorinaGame />}
        {g === "bukvin" && <Bukvin />}
        {g === "razvin" && <Razvin />}
        {g === "top" && <Top />}
      </div>
    );
  }

  const card = "relative flex min-h-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-black/50 px-6 text-center shadow-md transition active:scale-[0.98]";
  return (
    <div className="flex h-full flex-col gap-3">
      <button onClick={() => setG("vintorina")} className={`${card} bg-[#d9b98c]`}>
        <span className="text-3xl" style={{ color: WINE }}>Винторина</span>
        <span className="font-sans text-sm text-black/70">Картинка, строчка и 60 секунд: кто это?</span>
      </button>
      <button onClick={() => setG("bukvin")} className={`${card} bg-[#efe6d4]`}>
        <span className="text-3xl" style={{ color: WINE }}>Буквин</span>
        <span className="font-sans text-sm text-black/70">Литературное слово дня за шесть попыток</span>
      </button>
      <button onClick={() => setG("razvin")} className={`${card} bg-[#d9b98c]`}>
        <span className="text-3xl" style={{ color: WINE }}>Развинирование</span>
        <span className="font-sans text-sm text-black/70">Одно касание в день: что под листом?</span>
      </button>
      <button onClick={() => setG("top")} className="shrink-0 rounded-md py-2 font-sans text-sm shadow-md" style={{ background: WINE, color: "#f4ead6" }}>
        Рейтинг
      </button>
      <p className="shrink-0 text-center font-sans text-xs text-muted">10 книвиночек = 1 ₽ скидки на заказ · обмен откроется совсем скоро</p>
    </div>
  );
}
