"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addItem } from "@/lib/cart";

type Suggestion = {
  id: number; category: string; name: string; description: string;
  price_cents: number; slots: number; image: string | null; note: string;
};
type Pairing = "drink" | "snack";

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;

const titles: Record<Pairing, string> = {
  drink: "К этой книге я бы налил…",
  snack: "А к бокалу просится…",
};

// a torn top edge for the note: zigzag points along the top, then straight down and across
const TORN = "polygon(0 7%, 4% 0, 9% 6%, 15% 1%, 21% 7%, 27% 2%, 33% 6%, 40% 0, 46% 7%, 53% 2%, 60% 6%, 66% 1%, 73% 7%, 80% 2%, 86% 6%, 93% 0, 100% 6%, 100% 100%, 0 100%)";

// after the book: the sommelier suggests a drink, then a snack
const steps: Pairing[] = ["drink", "snack"];

export default function Wizard({ bookId }: { bookId: number }) {
  const router = useRouter();
  const [i, setI] = useState(0);

  function next() {
    if (i + 1 < steps.length) setI(i + 1);
    else router.push("/sommelier/wrap"); // on to packaging, then flowers and card
  }

  // key: a new step starts with a fresh "already suggested" list
  return <PairStep key={steps[i]} bookId={bookId} category={steps[i]} onDone={next} />;
}

function PairStep({ bookId, category, onDone }: { bookId: number; category: Pairing; onDone: () => void }) {
  const [s, setS] = useState<Suggestion | null>(null);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [empty, setEmpty] = useState(false);

  // runs again whenever "Предложить ещё" grows the excluded list
  useEffect(() => {
    const q = new URLSearchParams({ book: String(bookId), category, exclude: excluded.join(",") });
    fetch(`/api/sommelier/pair?${q}`)
      .then(async (r) => {
        if (r.status === 404) {
          setS(null);
          setEmpty(true);
          return;
        }
        setS(await r.json());
        setEmpty(false);
      })
      .catch(() => setEmpty(true));
  }, [bookId, category, excluded]);

  const button = "rounded-full bg-[#57030d] px-2 py-3 font-sans text-sm text-[#f4ead6] shadow-md transition active:scale-95 disabled:opacity-40";

  return (
    // the kraft sheet, with optional ink ornaments in two corners
    <div className="relative flex h-full flex-col rounded-xl bg-[#c9a77a] p-4 text-black"
      style={{
        backgroundImage: "url(/pair/corner-tr.png), url(/pair/corner-bl.png)",
        backgroundPosition: "top right, bottom left",
        backgroundSize: "40% auto, 35% auto",
        backgroundRepeat: "no-repeat",
      }}>

      {/* the photo card, slightly tilted, with the torn handwritten note at its foot */}
      <div className="relative flex min-h-0 flex-1 flex-col bg-[#f4ead6] p-2 shadow-lg" style={{ rotate: "-1deg" }}>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {s?.image ? (
            <img key={s.id} src={s.image} alt={s.name} className="h-full w-full object-cover motion-safe:animate-swoop" />
          ) : (
            <div className="flex h-full items-center justify-center bg-[#6b1f2b] p-6 text-center text-2xl text-[#f4ead6]">
              {s ? s.name : empty ? "Здесь сомелье пока нечего предложить." : "Сомелье думает…"}
            </div>
          )}
        </div>
        <div className="-mt-3 shrink-0 bg-[#efe6d4] px-4 pb-3 pt-5 font-hand text-xl leading-snug" style={{ clipPath: TORN }}>
          <p className="font-bold">{titles[category]}</p>
          {s && (
            <p>
              {s.name}. {s.note || s.description}
              <span className="whitespace-nowrap"> · {rub(s.price_cents)}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid shrink-0 grid-cols-3 gap-2">
        <button onClick={onDone} className={button}>Пропустить</button>
        <button onClick={() => s && setExcluded([...excluded, s.id])} disabled={!s} className={button}>Предложить ещё</button>
        <button disabled={!s} className={button} onClick={() => {
          if (!s) return;
          addItem({ id: s.id, name: s.name, category: s.category, price_cents: s.price_cents, slots: s.slots });
          onDone();
        }}>
          Добавить
        </button>
      </div>
    </div>
  );
}
