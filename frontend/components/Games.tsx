"use client";

import { useState, type ReactNode } from "react";
import { Game as VintorinaGame, Top } from "@/components/Vintorina";
import Bukvin from "@/components/Bukvin";
import Razvin from "@/components/Razvin";

const WINE = "#57030d";
const GOLD = "#b8892d";
type GameKey = "vintorina" | "bukvin" | "razvin";
type Choice = GameKey | "top" | null;

// the «вин» inside each name: italic and gold, like the «Литеравинный обзор» tab
const Vin = ({ children }: { children: ReactNode }) => (
  <i style={{ color: GOLD }}>{children}</i>
);

const NAMES: Record<GameKey, ReactNode> = {
  vintorina: <><Vin>Вин</Vin>торина</>,
  bukvin: <>Бук<Vin>вин</Vin></>,
  razvin: <>Раз<Vin>вин</Vin>ирование</>,
};

// the short rules shown once, before the first game; the full text lives in lib/legal-games.ts
const RULES: Record<GameKey, string[]> = {
  vintorina: [
    "Картинка и строчка описания: назовите героя, место или предмет.",
    "На ответ 60 секунд, до трёх попыток и одна подсказка — она делит награду пополам.",
    "Чем быстрее и точнее ответ, тем больше книвиночек.",
  ],
  bukvin: [
    "Угадайте литературное слово дня из 4–10 букв за шесть попыток.",
    "Принимаются только существующие слова.",
    "Чем быстрее и чем меньше попыток, тем больше книвиночек.",
  ],
  razvin: [
    "Одно касание в день: выберите плиточку и узнайте, что под ней.",
    "Под плиточкой от 10 до 1000 книвиночек — от листа до золотой лозы.",
    "После касания можно открыть всё поле и посмотреть, что было рядом.",
  ],
};

const seenKey = (k: GameKey) => `rules-seen-${k}`;
const seen = (k: GameKey) => { try { return localStorage.getItem(seenKey(k)) === "1"; } catch { return true; } };
const markSeen = (k: GameKey) => { try { localStorage.setItem(seenKey(k), "1"); } catch {} };

// «Игры»: three cards in the middle of the screen, like «Для себя / В подарок»; the chosen game opens in their place
export default function Games() {
  const [g, setG] = useState<Choice>(null);
  const [rules, setRules] = useState<GameKey | null>(null);

  // first time: the rules come up and the game starts only after «Понятно» (the Винторина clock must not run behind the popup)
  const open = (k: GameKey) => (seen(k) ? setG(k) : setRules(k));
  const accept = () => { if (rules) { markSeen(rules); setG(rules); setRules(null); } };

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
      <button onClick={() => open("vintorina")} className={`${card} bg-[#d9b98c]`}>
        <span className="text-3xl" style={{ color: WINE }}>{NAMES.vintorina}</span>
        <span className="font-sans text-sm text-black/70">Картинка, строчка и 60 секунд: что это?</span>
      </button>
      <button onClick={() => open("bukvin")} className={`${card} bg-[#efe6d4]`}>
        <span className="text-3xl" style={{ color: WINE }}>{NAMES.bukvin}</span>
        <span className="font-sans text-sm text-black/70">Литературное слово дня за шесть попыток</span>
      </button>
      <button onClick={() => open("razvin")} className={`${card} bg-[#d9b98c]`}>
        <span className="text-3xl" style={{ color: WINE }}>{NAMES.razvin}</span>
        <span className="font-sans text-sm text-black/70">Одно касание в день: что под плиточкой?</span>
      </button>
      <button onClick={() => setG("top")} className="shrink-0 rounded-md py-2 font-sans text-sm shadow-md" style={{ background: WINE, color: "#f4ead6" }}>
        Рейтинг
      </button>
      <p className="shrink-0 text-center font-sans text-xs text-muted">10 книвиночек = 1 ₽ скидки, до половины заказа · обмен откроется совсем скоро</p>

      {rules && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6" onClick={() => setRules(null)}>
          <div className="w-full max-w-sm rounded-xl bg-[#f4ead6] p-5 text-black shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-center text-2xl" style={{ color: WINE }}>{NAMES[rules]}</h2>
            <ul className="mt-3 flex flex-col gap-2 font-sans text-[15px]">
              {RULES[rules].map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p className="mt-3 font-sans text-xs text-black/60">Одна игра в день. Книвиночки получают те, кто вошёл через Telegram. Полные правила — в «Документах и реквизитах».</p>
            <button onClick={accept} className="mt-4 w-full rounded-md py-2 font-sans shadow-md" style={{ background: WINE, color: "#f4ead6" }}>Понятно</button>
          </div>
        </div>
      )}
    </div>
  );
}
