"use client";

import { useState } from "react";
import Image from "next/image";

// the butler's answers when someone taps the bunny; each tap shows the next one
const bunnyLines = [
  "Ах, этот? Ему обещали виноград.",
  "Он не продаётся. Мы спрашивали.",
  "Главный дегустатор. Винограда.",
  "Не трогайте, он считает бутылки.",
  "Обещание было устным. Он всё помнит.",
];

// the butler at his bar; "say" is his current line. Tapping the bunny interrupts him.
// The parent gives this component a new key on every step, which resets the bunny.
export default function ButlerHero({ say }: { say: string }) {
  const [bunny, setBunny] = useState<number | null>(null);
  const line = bunny === null ? say : bunnyLines[bunny];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-line">
      <Image src="/butler.png" alt="Сомелье за стойкой" width={1000} height={1500} priority className="h-auto w-full" />

      {/* invisible button over the bunny; percentages keep it in place at any width */}
      <button
        aria-label="Кролик"
        onClick={() => setBunny(bunny === null ? 0 : (bunny + 1) % bunnyLines.length)}
        className="absolute"
        style={{ left: "20%", top: "67%", width: "26%", height: "30%" }}
      />

      {/* the speech bubble; key={line} replays the swoop animation for every new line */}
      <div key={line} className="absolute left-4 right-4 top-4 rounded-2xl bg-paper-2/95 p-4 shadow-lg motion-safe:animate-swoop">
        <p className="text-lg">{line}</p>
      </div>
    </div>
  );
}
