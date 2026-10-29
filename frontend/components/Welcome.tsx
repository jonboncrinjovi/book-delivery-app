"use client";

import { useEffect, useState } from "react";
import ButlerHero from "@/components/ButlerHero";

type Today = { greeting: string; weekday: string; temp_c: number | null; sky: string; fact: string };
type Question = { q: string; options: string[]; answer: number };

const quiz: Question[] = [
  { q: "Как звали кота в «Мастере и Маргарите»?", options: ["Бегемот", "Азазелло", "Коровьев", "Воланд"], answer: 0 },
  { q: "Кто написал «Мёртвые души»?", options: ["Пушкин", "Гоголь", "Лермонтов", "Тургенев"], answer: 1 },
  { q: "«Все счастливые семьи похожи друг на друга…» Чей роман?", options: ["Достоевского", "Чехова", "Толстого", "Тургенева"], answer: 2 },
  { q: "Главный герой «Преступления и наказания»?", options: ["Базаров", "Карамазов", "Верховенский", "Раскольников"], answer: 3 },
  { q: "Где живёт Шерлок Холмс?", options: ["Бейкер-стрит", "Даунинг-стрит", "Флит-стрит", "Пикадилли"], answer: 0 },
];

const lovely: Record<string, string> = {
  понедельник: "Чудесный", вторник: "Чудесный", среда: "Чудесная", четверг: "Чудесный",
  пятница: "Чудесная", суббота: "Чудесная", воскресенье: "Чудесное",
};

function weatherQuip(sky: string) {
  if (sky === "дождь" || sky === "мокрый снег") return "идеальная погода, чтобы читать под пледом";
  if (sky === "снег") return "самое время для толстого романа";
  if (sky === "ясно" || sky === "почти ясно") return "для Петербурга почти подарок";
  return "петербургская классика";
}

const temp = (t: number) => (t > 0 ? `+${t}°` : `${t}°`);

// the warm-up, sized to fit beside the bunny: kraft and black like his bubbles
function Quiz({ q, picked, onPick }: { q: Question; picked: number | null; onPick: (i: number) => void }) {
  return (
    <div className="flex h-full flex-col rounded-xl border-2 border-black bg-[#f4ead6] p-2 text-black shadow-lg">
      <p className="font-sans text-[10px] uppercase tracking-wide opacity-60">Разминка</p>
      <p className="text-[15px] font-semibold leading-snug">{q.q}</p>
      <div className="mt-auto grid gap-1.5 font-sans text-[13px]">
        {q.options.map((o, i) => {
          const style =
            picked === null ? "border-black/30"
            : i === q.answer ? "border-black bg-black text-[#f4ead6]"
            : "border-black/20 opacity-40";
          return (
            <button key={o} disabled={picked !== null} onClick={() => onPick(i)}
              className={`rounded-md border px-1.5 py-1 text-left leading-tight ${style}`}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Welcome() {
  const [today, setToday] = useState<Today | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(false);
  const [q, setQ] = useState<Question | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    setQ(quiz[Math.floor(Math.random() * quiz.length)]);
    fetch("/api/today")
      .then((r) => r.json())
      .then(setToday)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const monologue = [
    `${today?.greeting ?? "Добрый день"}! Позвольте представиться: Книжный сомелье.`,
    "Единственный во всём Санкт-Петербурге. И, признаюсь, я этим очень горжусь.",
    today ? `${lovely[today.weekday] ?? "Чудесный"} ${today.weekday}, не правда ли?` : null,
    today && today.temp_c !== null
      ? `За окном ${temp(today.temp_c)}${today.sky ? `, ${today.sky}` : ""}: ${weatherQuip(today.sky)}.`
      : null,
    today?.fact ? `Кстати, ${today.fact}.` : "Кстати, сегодня прекрасный день, чтобы начать книгу, которую вы давно откладывали.",
    "Правила дома просты: вы говорите, для кого и под какое настроение…",
    "…а я подбираю книгу. Можно вслепую: узнаете её только при получении.",
    "К книге найдутся напиток, закуска и цветы. Тапочки приветствуются.",
    "Готовы? Жмите большую кнопку с моим портретом внизу экрана.",
    "А если точно знаете, что ищете, поиск ниже в вашем полном распоряжении.",
  ].filter((l): l is string => Boolean(l));

  const reaction =
    q && picked !== null
      ? picked === q.answer
        ? "Браво. Вы определённо по адресу."
        : `Почти. Правильно: «${q.options[q.answer]}». Гостям такое прощается.`
      : null;
  const lines = reaction ? [...monologue, reaction] : monologue;

  return (
    // h-full: exactly the card's height. The picture takes whatever the search row leaves.
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-0 flex-1">
        <ButlerHero
          lines={loaded ? lines : []}
          onDone={() => setDone(true)}
          overlay={done && q ? <Quiz q={q} picked={picked} onPick={setPicked} /> : null}
        />
      </div>

      <form action="/search" className="flex shrink-0 overflow-hidden rounded-2xl border border-line bg-paper-2">
        <input name="q" type="search" placeholder="Достоевский, «цветы», «к чаю»…"
          className="min-w-0 flex-1 bg-transparent px-4 py-2.5 font-sans outline-none" />
        <button aria-label="Искать" className="px-4 text-wine">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14z" />
            <path d="M20 20l-4-4" />
          </svg>
        </button>
      </form>

      {today && today.temp_c !== null && (
        <p className="shrink-0 text-center font-sans text-[10px] leading-none text-muted">Погода: MET Norway</p>
      )}
    </div>
  );
}
