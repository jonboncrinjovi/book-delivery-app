"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useV } from "@/lib/address";

type Tag = { id: number; name: string; children?: Tag[] };
type Word = { key: number; tag: Tag; size: number; vertical: boolean; font: string; bold: boolean; upper: boolean; delay: number };

const FONTS = ["font-serif", "font-sans", "font-hand"];
const INK = "#1c1410";
const RED_INK = "#8c1c2b";

// the type-specimen sheet: 80 copies of the subtags in mixed faces, sizes and directions, shuffled; built on a tap
function makeSheet(subtags: Tag[]): Word[] {
  return Array.from({ length: 80 }, (_, i) => ({
    key: i,
    tag: subtags[i % subtags.length],
    size: 12 + Math.random() * 24,
    vertical: Math.random() < 0.3,
    font: FONTS[Math.floor(Math.random() * FONTS.length)],
    bold: Math.random() < 0.45,
    upper: Math.random() < 0.3,
    delay: Math.random() * 0.5,
  })).sort(() => Math.random() - 0.5);
}

// the book as a stencil: its ink lines take the card's ink colour, so it inverts with the theme
const BOOK: CSSProperties = {
  WebkitMaskImage: "url(/sommelier/book.png)", maskImage: "url(/sommelier/book.png)",
  WebkitMaskSize: "contain", maskSize: "contain",
  WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
  WebkitMaskPosition: "center", maskPosition: "center",
};

// a luggage tag: corners cut at the top, a punched hole, text up the middle like a book's spine
const TAG_SHAPE = "polygon(22% 0, 78% 0, 100% 10%, 100% 100%, 0 100%, 0 10%)";

function LuggageTag({ label, filled, onClick }: { label?: string; filled?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} aria-label={label ?? "Пустой тег"} className="relative h-full w-full">
      {/* outline trick: a darker shape with a slightly smaller one on top leaves a thin border */}
      <span className="absolute inset-0 bg-ink/40" style={{ clipPath: TAG_SHAPE }} />
      <span className={`absolute inset-[2px] ${filled ? "bg-wine" : "bg-paper-2"}`} style={{ clipPath: TAG_SHAPE }} />
      <span className="absolute left-1/2 top-[7%] size-2 -translate-x-1/2 rounded-full border border-ink/40 bg-paper" />
      {label && (
        // the outer box centres; only the inner text is vertical, turned to read bottom to top
        <span className="absolute inset-x-0 bottom-2 top-[18%] flex items-center justify-center overflow-hidden">
          <span className={`whitespace-nowrap text-[13px] leading-none ${filled ? "text-paper-2" : "text-ink"}`}
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
            {label}
          </span>
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
  // which copy on the sheet was circled for each chosen tag
  const [marks, setMarks] = useState<Record<number, number>>({});
  const [overlay, setOverlay] = useState<"anchors" | "sheet" | null>(null);
  const [sheet, setSheet] = useState<Word[]>([]);
  const v = useV();

  useEffect(() => {
    fetch("/api/tags").then((r) => r.json()).then(setAnchors).catch(() => {});
  }, []);

  const subtags = anchor?.children ?? [];
  const chosenTags = chosen.map((id) => subtags.find((t) => t.id === id)).filter((t): t is Tag => Boolean(t));

  // "+": first the main genres; once one is chosen, the sheet of its subgenres
  function plus() {
    if (!anchor) {
      setOverlay("anchors");
    } else if (subtags.length > 0) {
      setSheet(makeSheet(subtags));
      setOverlay("sheet");
    }
  }

  function unchoose(id: number) {
    setChosen((c) => c.filter((x) => x !== id));
    setMarks(({ [id]: _, ...rest }) => rest);
  }

  // on the sheet: circle this copy, or uncircle it
  function tapWord(w: Word) {
    if (chosen.includes(w.tag.id)) {
      unchoose(w.tag.id);
    } else {
      setChosen((c) => [...c, w.tag.id]);
      setMarks((m) => ({ ...m, [w.tag.id]: w.key }));
    }
  }

  // the red tag: tap it to clear everything and start over
  function clearAnchor() {
    if (anchor) {
      setAnchor(null);
      setChosen([]);
      setMarks({});
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
    // relative: the overlays below cover this card, not the whole phone screen
    <div className="relative flex h-full flex-col items-center">
      {/* the open book: takes whatever height the rest leaves */}
      <div aria-hidden="true" className="min-h-0 w-full flex-1 bg-ink" style={BOOK} />

      {/* the prompt and the row of tags, between the book and the seal */}
      <div className="flex w-full shrink-0 flex-col items-center gap-3 py-4">
        <p className="text-center text-lg">
          {anchor ? v("Добавьте оттенков или сразу задавайте.", "Добавь оттенков или сразу задавай.") : v("С чего начнём? Нажмите на плюс.", "С чего начнём? Нажми на плюс.")}
        </p>
        <div className="flex h-28 w-full items-stretch justify-center gap-2">
          <div className="w-10"><LuggageTag filled label={anchor?.name} onClick={clearAnchor} /></div>
          {Array.from({ length: SLOTS }, (_, i) => {
            const t = chosenTags[i];
            return (
              <div key={i} className="w-10">
                <LuggageTag label={t?.name} onClick={t ? () => unchoose(t.id) : plus} />
              </div>
            );
          })}
          <div className="flex flex-col items-center justify-center gap-1">
            <button onClick={plus} aria-label="Добавить теги"
              className="flex size-9 items-center justify-center rounded-full border-2 border-ink text-xl leading-none">+</button>
            {chosenTags.length > SLOTS && <span className="font-sans text-xs text-muted">+{chosenTags.length - SLOTS}</span>}
          </div>
        </div>
      </div>

      {/* the wax seal, the same artwork as «Открыть» */}
      <button onClick={go}
        className="flex size-36 shrink-0 items-center justify-center bg-contain bg-center bg-no-repeat text-2xl text-[#f4ead6] drop-shadow-md transition active:scale-95"
        style={{ backgroundImage: "url(/pick/seal.png)" }}>
        Задать
      </button>
      <button onClick={() => router.push("/sommelier/pick")} className="shrink-0 pb-1 font-sans text-xs text-muted underline">
        Удиви меня
      </button>

      {/* the main genres: calm, large, one tap; -inset-3 reaches over the card's padding to its rounded edge */}
      {overlay === "anchors" && (
        <div className="card absolute -inset-3 z-[60] flex flex-col items-center justify-center gap-4 rounded-3xl p-6">
          <p className="font-sans text-sm uppercase tracking-wide text-muted">Главный жанр</p>
          {anchors.map((a) => (
            <button key={a.id} className="text-3xl transition hover:text-wine"
              onClick={() => { setAnchor(a); setChosen([]); setMarks({}); setOverlay(null); }}>
              {a.name}
            </button>
          ))}
          <button onClick={() => setOverlay(null)} className="mt-6 font-sans text-sm text-muted">Закрыть</button>
        </div>
      )}

      {/* the sheet: a type-specimen collage of the subgenres, kraft on the left and white on the right */}
      {overlay === "sheet" && (
        <div className="card absolute -inset-3 z-[60] flex flex-col rounded-3xl px-5 pb-5 pt-3">
          <p className="shrink-0 pb-2 text-center font-sans text-xs text-muted">Обведите то, что по душе</p>
          <div className="relative min-h-0 flex-1 overflow-hidden shadow-lg"
            style={{
              backgroundImage: "url(/textures/paper.jpg), linear-gradient(to right, #c9a77a 50%, #f3eee4 50%)",
              backgroundSize: "512px, 100% 100%",
              backgroundBlendMode: "multiply",
              color: INK,
            }}>
            <div className="flex h-full flex-wrap content-start items-center justify-center p-3">
              {sheet.map((w) => {
                const n = marks[w.tag.id] === w.key ? chosen.indexOf(w.tag.id) + 1 : 0;
                return (
                  <button key={w.key} onClick={() => tapWord(w)}
                    className={`relative m-1 whitespace-nowrap leading-none motion-safe:animate-storm ${w.font} ${w.bold ? "font-bold" : ""} ${w.upper ? "uppercase tracking-tight" : ""}`}
                    style={{ fontSize: `${w.size}px`, writingMode: w.vertical ? "vertical-rl" : undefined, animationDelay: `${w.delay}s` }}>
                    {w.tag.name}
                    {n > 0 && (
                      <>
                        {/* a hand-drawn ring in wine ink, slightly askew, and its number */}
                        <span aria-hidden className="pointer-events-none absolute -inset-x-2 -inset-y-1.5 rounded-[50%] border-[2.5px]"
                          style={{ borderColor: RED_INK, rotate: "-5deg" }} />
                        <span aria-hidden className="pointer-events-none absolute -right-3 -top-3 font-hand text-xl font-bold"
                          style={{ color: RED_INK, writingMode: "horizontal-tb" }}>{n}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <button onClick={() => setOverlay(null)} aria-label="Готово"
            className="absolute bottom-8 left-1/2 z-[61] flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-[#57030d] pb-1 text-3xl text-[#f4ead6] shadow-lg">
            ‹
          </button>
        </div>
      )}
    </div>
  );
}
