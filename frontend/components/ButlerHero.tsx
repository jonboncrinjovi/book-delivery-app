"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import SpeechBubble from "@/components/SpeechBubble";
import type { Shape, Tail } from "@/components/SpeechBubble";

const bunnyLines = [
  "Ах, этот? Ему обещали виноград.",
  "Он не продаётся. Мы спрашивали.",
  "Главный дегустатор. Винограда.",
  "Не трогайте, он считает бутылки.",
  "Обещание было устным. Он всё помнит.",
];
const hundredth = "Сто касаний. Он впечатлён. Я, признаться, тоже.";

// the four free areas of the picture (percent of its size); tune here if one covers his face
const TL: CSSProperties = { left: "3%", top: "3%", width: "44%" };
const TR: CSSProperties = { right: "3%", top: "3%", width: "36%" };
const MR: CSSProperties = { right: "3%", top: "44%", width: "38%" };
const BR: CSSProperties = { right: "3%", bottom: "5%", width: "46%" };

// low: in the lower half, where the warm-up sits once it appears
type Stage = { style: CSSProperties; shape: Shape; tail: Tail; rotate: number; low?: boolean };

const stages: Stage[] = [
  { style: TL, shape: "round", tail: "bottom-right", rotate: -2 },
  { style: BR, shape: "wobble", tail: "top-left", rotate: 1.5, low: true },
  { style: TR, shape: "box", tail: "bottom-left", rotate: 2.5 },
  { style: MR, shape: "round", tail: "left", rotate: -1, low: true },
  { style: { ...TL, width: "50%" }, shape: "burst", tail: "none", rotate: -3 },
  { style: BR, shape: "round", tail: "top-left", rotate: 0.5, low: true },
  { style: TR, shape: "wobble", tail: "bottom-left", rotate: -2 },
  { style: TL, shape: "box", tail: "bottom-right", rotate: 1.5 },
];

// lines: what he says, one per tap. onDone: called once the last line shows.
// overlay: something placed on the picture to the right of the bunny (the warm-up);
// while it's there, his bubbles keep to the top of the picture.
export default function ButlerHero({ lines = [], onDone, overlay }: {
  lines?: string[];
  onDone?: () => void;
  overlay?: ReactNode;
}) {
  const [i, setI] = useState(0);
  const prevLen = useRef(lines.length);

  useEffect(() => {
    if (lines.length > prevLen.current && i === prevLen.current - 1) setI(lines.length - 1);
    prevLen.current = lines.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length]);

  useEffect(() => {
    if (lines.length > 0 && i === lines.length - 1) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, lines.length]);

  function advance() {
    if (i < lines.length - 1) setI(i + 1);
  }

  const taps = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bunnyLine, setBunnyLine] = useState<string | null>(null);
  function tapBunny() {
    taps.current += 1;
    const n = taps.current;
    if (n % 10 !== 0) return;
    setBunnyLine(n === 100 ? hundredth : bunnyLines[(n / 10 - 1) % bunnyLines.length]);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setBunnyLine(null), 4500);
  }

  const pool = overlay ? stages.filter((s) => !s.low) : stages;
  const stage = pool[i % pool.length];
  const more = i < lines.length - 1;

  return (
    // h-full + aspect-[2/3]: as tall as the space allows, at the picture's own proportions;
    // max-w-full: on narrow screens it may trim a little from the sides (object-cover), never top or bottom
    <div onClick={advance}
      className={`relative mx-auto aspect-[2/3] h-full max-w-full select-none overflow-hidden rounded-2xl border border-line ${more ? "cursor-pointer" : ""}`}>
      <Image src="/butler.png" alt="Книжный сомелье за стойкой" fill priority
        sizes="(max-width: 448px) 100vw, 448px" className="object-cover" />

      <button aria-label="Кролик" className="absolute"
        onClick={(e) => { e.stopPropagation(); tapBunny(); }}
        style={{ left: "20%", top: "67%", width: "26%", height: "30%" }} />

      {lines.length > 0 && (
        <SpeechBubble key={i} shape={stage.shape} tail={stage.tail} style={stage.style} rotate={stage.rotate} more={more}>
          {lines[i]}
        </SpeechBubble>
      )}

      {bunnyLine && (
        <SpeechBubble key={bunnyLine} shape="wobble" tail="bottom-left" rotate={-1.5}
          style={{ left: "4%", top: "50%", width: "52%" }}>
          {bunnyLine}
        </SpeechBubble>
      )}

      {/* to the right of the bunny; its own taps must not advance his speech */}
      {overlay && (
        <div className="absolute z-20 motion-safe:animate-swoop" onClick={(e) => e.stopPropagation()}
          style={{ left: "53%", top: "44.5%", right: "3%", bottom: "3%" }}>
          {overlay}
        </div>
      )}
    </div>
  );
}
