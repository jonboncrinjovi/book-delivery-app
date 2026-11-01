"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Tag = { id: number; name: string; children?: Tag[] };
type StormWord = { key: number; tag: Tag; size: number; x: number; y: number; rot: number; delay: number };

// 140 copies of the subtags at random sizes, places and angles; built on a tap, never during render
function makeStorm(subtags: Tag[]): StormWord[] {
  return Array.from({ length: 140 }, (_, i) => ({
    key: i,
    tag: subtags[i % subtags.length],
    size: 14 + Math.random() * 46,
    x: Math.random() * 88,
    y: Math.random() * 90,
    rot: (Math.random() - 0.5) * 40,
    delay: Math.random() * 0.8,
  }));
}

// a luggage tag: corners cut at the top, a punched hole, text written vertically
const TAG_SHAPE = "polygon(22% 0, 78% 0, 100% 10%, 100% 100%, 0 100%, 0 10%)";

function LuggageTag({ label, filled, onClick }: { label?: string; filled?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} aria-label={label ?? "Пустой тег"} className="relative h-full w-full">
      {/* outline trick: a darker shape with a slightly smaller one on top leaves a thin border */}
      <span className="absolute inset-0 bg-ink/40" style={{ clipPath: TAG_SHAPE }} />
      <span className={`absolute inset-[2px] ${filled ? "bg-wine" : "bg-paper-2"}`} style={{ clipPath: TAG_SHAPE }} />
      <span className="absolute left-1/2 top-[7%] size-2 -translate-x-1/2 rounded-full border border-ink/40 bg-paper" />
      {label && (
        <span className={`absolute inset-x-0 bottom-2 top-[17%] flex items-center justify-center overflow-hidden font-sans text-xs ${filled ? "text-paper-2" : "text-ink"}`}
          style={{ writingMode: "vertical-rl" }}>
          {label}
        </span>
      )}
    </button>
  );
}

const SLOTS = 5; // empty tags shown after the red one

export default function TagsPage() {
  const router = useRouter();
  const [anchors, setAnchors] = useState<Tag[]>([]);
  const [anchor, setAnchor] = useState<Tag | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [overlay, setOverlay] = useState<"anchors" | "storm" | null>(null);
  const [storm, setStorm] = useState<StormWord[]>([]);

  useEffect(() => {
    fetch("/api/tags").then((r) => r.json()).then(setAnchors).catch(() => {});
  }, []);

  const subtags = anchor?.children ?? [];
  const chosenTags = subtags.filter((t) => chosen.includes(t.id));

  // "+": first the main genres; once one is chosen, the storm of its subgenres
  function plus() {
    if (!anchor) {
      setOverlay("anchors");
    } else if (subtags.length > 0) {
      setStorm(makeStorm(subtags));
      setOverlay("storm");
    }
  }

  function toggle(id: number) {
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  // the red tag: tap it to clear everything and start over
  function clearAnchor() {
    if (anchor) {
      setAnchor(null);
      setChosen([]);
    } else {
      setOverlay("anchors");
    }
  }

  function go() {
    const q = new URLSearchParams();
    if (anchor) q.set("anchor", String(anchor.id));
    if (chosen.length) q.set("tags", chosen.join(","));
    const s = q.toString();
    router.push(`/sommelier/pick${s ? `?${s}` : ""}`);
  }

  return (
    <div className="flex h-full flex-col items-center gap-3">
      {/* the open book: takes whatever height is left */}
      <div aria-hidden="true" className="min-h-0 w-full flex-1 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/sommelier/book.png)" }} />

      <p className="shrink-0 text-center text-lg">
        {anchor ? "Добавьте оттенков или сразу задавайте." : "С чего начнём? Нажмите на плюс."}
      </p>

      {/* the row of tags */}
      <div className="flex h-28 w-full shrink-0 items-stretch justify-center gap-2">
        <div className="w-10"><LuggageTag filled label={anchor?.name} onClick={clearAnchor} /></div>
        {Array.from({ length: SLOTS }, (_, i) => {
          const t = chosenTags[i];
          return (
            <div key={i} className="w-10">
              <LuggageTag label={t?.name} onClick={t ? () => toggle(t.id) : plus} />
            </div>
          );
        })}
        <div className="flex flex-col items-center justify-center gap-1">
          <button onClick={plus} aria-label="Добавить теги"
            className="flex size-9 items-center justify-center rounded-full border-2 border-ink text-xl leading-none">+</button>
          {chosenTags.length > SLOTS && <span className="font-sans text-xs text-muted">+{chosenTags.length - SLOTS}</span>}
        </div>
      </div>

      {/* the wax seal (CSS stand-in until the artwork) */}
      <button onClick={go}
        className="flex size-32 shrink-0 items-center justify-center rounded-full bg-wine text-2xl text-paper-2 shadow-[0_6px_0_rgba(0,0,0,.2)] ring-8 ring-wine/30 transition active:scale-95">
        Задать
      </button>
      <button onClick={() => router.push("/sommelier/pick")} className="shrink-0 font-sans text-xs text-muted underline">
        Удиви меня
      </button>

      {/* the main genres: calm, large, one tap */}
      {overlay === "anchors" && (
        <div className="card fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 p-6">
          <p className="font-sans text-sm uppercase tracking-wide text-muted">Главный жанр</p>
          {anchors.map((a) => (
            <button key={a.id} className="text-3xl transition hover:text-wine"
              onClick={() => { setAnchor(a); setChosen([]); setOverlay(null); }}>
              {a.name}
            </button>
          ))}
          <button onClick={() => setOverlay(null)} className="mt-6 font-sans text-sm text-muted">Закрыть</button>
        </div>
      )}

      {/* the storm: every subgenre of the chosen genre, all over the screen */}
      {overlay === "storm" && (
        <div className="card fixed inset-0 z-[60] overflow-hidden">
          {storm.map((w) => (
            <button key={w.key} onClick={() => toggle(w.tag.id)}
              className={`absolute whitespace-nowrap leading-none motion-safe:animate-storm ${chosen.includes(w.tag.id) ? "text-wine underline" : "text-ink/80"}`}
              style={{ left: `${w.x}%`, top: `${w.y}%`, fontSize: `${w.size}px`, rotate: `${w.rot}deg`, animationDelay: `${w.delay}s` }}>
              {w.tag.name}
            </button>
          ))}
          <button onClick={() => setOverlay(null)}
            className="fixed bottom-8 left-1/2 z-[61] -translate-x-1/2 rounded-full bg-wine px-8 py-3 font-sans text-paper-2 shadow-lg">
            Готово
          </button>
        </div>
      )}
    </div>
  );
}
