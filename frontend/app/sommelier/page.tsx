"use client"; // the whole page is interactive: taps, swipes, state

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { addItem } from "@/lib/cart";
import { useRouter } from "next/navigation";

// shapes of the API's answers (see sommelier.go)
type Tag = { id: number; name: string; children?: Tag[] };
type Masked = {
  id: number; price_cents: number; cover_blur: string | null;
  hints: string[]; tags: string[]; quotes: string[];
};
type Revealed = {
  id: number; name: string; author: string | null; cover: string | null;
  hook: string; description: string; price_cents: number;
};
type StormWord = { key: number; tag: Tag; size: number; x: number; y: number; rot: number; delay: number };

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;

// 140 copies of the subtags, scattered at random sizes, positions and angles.
// Called from a click, never during render: random values in render would differ
// between server and browser and break the page.
function makeStorm(subtags: Tag[]): StormWord[] {
  return Array.from({ length: 140 }, (_, i) => ({
    key: i,
    tag: subtags[i % subtags.length],
    size: 14 + Math.random() * 46,  // 14–60 px
    x: Math.random() * 88,          // % from the left
    y: Math.random() * 90,          // % from the top
    rot: (Math.random() - 0.5) * 40, // −20° to +20°
    delay: Math.random() * 0.8,     // staggered arrival
  }));
}

export default function SommelierPage() {
  // useState: values that, when changed, redraw the page
  const router = useRouter();
  const [anchors, setAnchors] = useState<Tag[]>([]);
  const [anchor, setAnchor] = useState<Tag | null>(null);   // chosen main genre
  const [chosen, setChosen] = useState<number[]>([]);       // chosen subtag ids
  const [storm, setStorm] = useState<StormWord[] | null>(null);
  const [card, setCard] = useState<Masked | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [seen, setSeen] = useState<number[]>([]);           // books already shown, never repeated
  const [message, setMessage] = useState("");
  const [added, setAdded] = useState<string | null>(null);

  // useEffect with []: run once after the page appears; load the genres
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then(setAnchors)
      .catch(() => setMessage("Не удалось загрузить жанры"));
  }, []);

  function chooseAnchor(t: Tag | null) {
    // a new genre starts a fresh round
    setAnchor(t);
    setChosen([]);
    setSeen([]);
    setCard(null);
    setRevealed(null);
    setMessage("");
    setAdded(null);
  }

  function toggleTag(id: number) {
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  async function pick(exclude: number[] = seen) {
    const tags = anchor ? [anchor.id, ...chosen] : [];
    setAdded(null);
    try {
      const res = await fetch(`/api/sommelier/pick?tags=${tags.join(",")}&exclude=${exclude.join(",")}`);
      if (res.status === 404) {
        setCard(null);
        setMessage("Сомелье перебрал всё по этим тегам. Убери пару тегов или выбери другой жанр.");
        return;
      }
      if (!res.ok) throw new Error();
      setCard(await res.json());
      setRevealed(null);
      setMessage("");
    } catch {
      setMessage("Что-то пошло не так, попробуй ещё раз");
    }
  }

  function discard() {
    if (!card) return;
    const next = [...seen, card.id];
    setSeen(next);
    pick(next); // straight to the next book
  }

  async function reveal() {
    if (!card) return;
    const res = await fetch(`/api/sommelier/reveal/${card.id}`);
    if (res.ok) setRevealed(await res.json());
  }

  function accept() {
    if (!card) return;
    addItem({
      id: card.id,
      category: "book",
      name: revealed ? revealed.name : "Книга-сюрприз",
      price_cents: card.price_cents,
      slots: 2, // a typical book; the server checks the real number at checkout
      hidden: !revealed,
    });
    router.push('/sommelier/next?book=${card.id}');
  }

  const subtags = anchor?.children ?? [];
  const image = revealed ? revealed.cover : card?.cover_blur;

  return (
    <div className="pt-4">
      <h1 className="text-3xl font-bold">Книжный сомелье</h1>
      <p className="mt-1 font-sans text-sm text-muted">Выбери жанр и настроение, остальное за нами.</p>

      {/* tag chips: first the genres; after choosing one, the genre plus its subtags and "+" */}
      <div className="mt-5 flex flex-wrap gap-2 font-sans text-sm">
        {!anchor && anchors.map((a) => (
          <Chip key={a.id} onClick={() => chooseAnchor(a)}>{a.name}</Chip>
        ))}
        {anchor && (
          <>
            <Chip active onClick={() => chooseAnchor(null)}>{anchor.name} ✕</Chip>
            {subtags.slice(0, 3).map((t) => (
              <Chip key={t.id} active={chosen.includes(t.id)} onClick={() => toggleTag(t.id)}>{t.name}</Chip>
            ))}
            {subtags.length > 0 && <Chip onClick={() => setStorm(makeStorm(subtags))}>+</Chip>}
          </>
        )}
      </div>

      {/* the wax seal, shown while there's no card on screen */}
      {!card && (
        <div className="mt-10 flex justify-center">
          <button onClick={() => pick()}
            className="flex size-44 items-center justify-center rounded-full bg-wine text-2xl font-bold text-paper-2 shadow-[0_8px_0_rgba(0,0,0,.15)] ring-8 ring-wine/30 transition active:scale-95">
            Подобрать
          </button>
        </div>
      )}

      {message && <p className="mt-6 text-center font-sans text-sm text-muted">{message}</p>}

      {added && (
        <div className="mt-6 rounded-2xl border border-line bg-paper-2 p-4 text-center">
          <p>«{added}» в корзине.</p>
          <p className="mt-1 font-sans text-sm text-muted">Скоро сомелье подберёт к ней напиток и закуску.</p>
        </div>
      )}

      {card && (
        <div className="mt-6">
          <SwipeCard onLeft={discard} onRight={accept}>
            <div className="overflow-hidden rounded-3xl border border-line bg-paper-2">
              {image ? (
                // draggable={false}: stops the browser's own image dragging from fighting the swipe
                <img src={image} alt="" draggable={false} className="aspect-[2/3] w-full object-cover" />
              ) : (
                <div className="aspect-[2/3] w-full bg-line" />
              )}
              <div className="p-4">
                {revealed ? (
                  <>
                    <p className="text-xl font-bold">{revealed.name}</p>
                    <p className="font-sans text-sm text-muted">{revealed.author}</p>
                    {revealed.hook && <p className="mt-2 italic">«{revealed.hook}»</p>}
                  </>
                ) : (
                  <div className="flex flex-wrap gap-2 font-sans text-xs">
                    {card.hints.map((h) => (
                      <span key={h} className="rounded-full bg-paper px-3 py-1">{h}</span>
                    ))}
                  </div>
                )}
                <p className="mt-3 font-sans text-sm">{rub(card.price_cents)}</p>
              </div>
            </div>
          </SwipeCard>

          {/* the three magi: quotes for now, real reviews once they exist */}
          <div className="mt-4 space-y-2">
            {card.quotes.map((q, i) => (
              <blockquote key={`${card.id}-${i}`} style={{ animationDelay: `${0.2 + i * 0.25}s` }}
                className="rounded-2xl border border-line bg-paper-2 p-3 italic motion-safe:animate-swoop">
                «{q}»
              </blockquote>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between font-sans">
            <button onClick={discard} aria-label="Пропустить" className="size-14 rounded-full border border-line text-xl">✕</button>
            {!revealed && (
              <button onClick={reveal} className="rounded-full border border-wine px-6 py-3 text-wine">Раскрыть</button>
            )}
            <button onClick={accept} aria-label="В корзину" className="size-14 rounded-full bg-wine text-xl text-paper-2">♥</button>
          </div>
          <p className="mt-3 text-center font-sans text-xs text-muted">Свайп вправо: в корзину. Влево: дальше.</p>
        </div>
      )}

      {/* the word storm: covers everything, including the bottom bar */}
      {storm && (
        <div className="fixed inset-0 z-[60] overflow-hidden bg-paper">
          {storm.map((w) => (
            <button key={w.key} onClick={() => toggleTag(w.tag.id)}
              className={`absolute whitespace-nowrap leading-none motion-safe:animate-storm ${chosen.includes(w.tag.id) ? "text-wine underline" : "text-ink/80"}`}
              // "rotate" is its own CSS property here, so the storm animation's scale doesn't wipe it out
              style={{ left: `${w.x}%`, top: `${w.y}%`, fontSize: `${w.size}px`, rotate: `${w.rot}deg`, animationDelay: `${w.delay}s` }}>
              {w.tag.name}
            </button>
          ))}
          <button onClick={() => setStorm(null)}
            className="fixed bottom-8 left-1/2 z-[61] -translate-x-1/2 rounded-full bg-wine px-8 py-3 font-sans text-paper-2 shadow-lg">
            Готово
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-4 py-1.5 ${active ? "border-wine bg-wine text-paper-2" : "border-line bg-paper-2"}`}>
      {children}
    </button>
  );
}

// SwipeCard follows the finger (or mouse); released far enough left or right, it triggers the action
function SwipeCard({ onLeft, onRight, children }: { onLeft: () => void; onRight: () => void; children: ReactNode }) {
  const [startX, setStartX] = useState<number | null>(null); // where the drag began; null = not dragging
  const [dx, setDx] = useState(0);                            // how far it has moved

  function end() {
    if (dx > 110) onRight();
    else if (dx < -110) onLeft();
    setStartX(null);
    setDx(0); // springs back (or the next card appears)
  }

  return (
    <div
      // pointer events cover mouse, touch and pen alike
      onPointerDown={(e) => {
        setStartX(e.clientX);
        e.currentTarget.setPointerCapture(e.pointerId); // keep receiving moves even if the finger leaves the card
      }}
      onPointerMove={(e) => {
        if (startX !== null) setDx(e.clientX - startX);
      }}
      onPointerUp={end}
      onPointerCancel={() => {
        setStartX(null);
        setDx(0);
      }}
      // tilt a little in the swipe direction; animate only the spring-back, not the drag itself
      style={{ transform: `translateX(${dx}px) rotate(${dx / 18}deg)`, transition: startX === null ? "transform 0.25s" : "none" }}
      // touch-pan-y: vertical scrolling stays with the browser, horizontal movement is ours
      className="touch-pan-y select-none"
    >
      {children}
    </div>
  );
}
