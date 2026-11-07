"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setPackaging, useCart } from "@/lib/cart";
import { useV } from "@/lib/address";

type BagColor = { code: string; name: string; hex: string };
type BoxSize = { code: string; name: string; capacity_slots: number | null; price_cents: number };

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;
const TORN = "polygon(0 4%, 4% 0, 9% 3%, 15% 1%, 21% 4%, 27% 1%, 33% 3%, 40% 0, 46% 4%, 53% 1%, 60% 3%, 66% 0, 73% 4%, 80% 1%, 86% 3%, 93% 0, 100% 3%, 100% 100%, 0 100%)";

// a bag: your stamped artwork if it exists, otherwise a plain bag in the right colour
function Bag({ c, onClick }: { c: BagColor; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={c.name} className="group flex flex-1 flex-col items-center transition active:scale-95">
      <span className="h-4 w-1/2 rounded-t-full border-[3px] border-b-0 border-[#7a5a32]" />
      <span className="flex aspect-[4/5] w-full items-center justify-center bg-cover bg-center shadow-md group-hover:-translate-y-0.5"
        style={{ backgroundColor: c.hex, backgroundImage: `url(/wrap/bag-${c.code}.png)` }}>
        <span className="text-center text-[8px] leading-tight text-black/50">Книжки<br />&amp;<br />Винишко</span>
      </span>
      <span className="mt-1 font-sans text-[10px]">{c.name}</span>
    </button>
  );
}

export default function WrapPage() {
  const router = useRouter();
  const cart = useCart();
  const [colors, setColors] = useState<BagColor[]>([]);
  const [boxes, setBoxes] = useState<BoxSize[]>([]);
  const v = useV();

  useEffect(() => {
    fetch("/api/bag-colors").then((r) => r.json()).then(setColors).catch(() => {});
    fetch("/api/box-sizes").then((r) => r.json()).then(setBoxes).catch(() => {});
  }, []);

  const blind = cart.items.some((i) => i.hidden);
  const used = cart.items.reduce((n, i) => n + i.slots * i.qty, 0);
  // the smallest box everything fits in; if none is big enough, the custom one
  const fitting = boxes
    .filter((b) => b.code !== "BAG" && b.capacity_slots !== null && b.capacity_slots >= used)
    .sort((a, b) => (a.capacity_slots ?? 0) - (b.capacity_slots ?? 0))[0]
    ?? boxes.find((b) => b.code === "CUSTOM");

  function choose(box: string, bag: string | null) {
    setPackaging(box, bag);
    router.push("/sommelier/extras");
  }

  const button = "flex-1 rounded-full bg-[#57030d] px-3 py-3 font-sans text-sm text-[#f4ead6] shadow-md transition active:scale-95";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-[#c9a77a] text-black">
      {/* top: the headline and the illustration */}
      <div className="flex min-h-0 flex-1 items-center gap-2 bg-contain bg-right bg-no-repeat p-5"
        style={{ backgroundImage: `url(/wrap/${blind ? "parcel" : "bags"}.png)`, backgroundSize: "auto 75%" }}>
        <h1 className="max-w-[55%] text-3xl leading-tight">
          {blind ? v("Итак, у Вас свидание вслепую. Как волнительно!", "Итак, у тебя свидание вслепую. Как волнительно!") : v("Ваш заказ почти готов. Во что упакуем?", "Твой заказ почти готов. Во что упакуем?")}
        </h1>
      </div>

      {/* bottom: the torn paper with the bags */}
      <div className="shrink-0 bg-[#f4ead6] px-4 pb-4 pt-7" style={{ clipPath: TORN }}>
        <p className="text-center text-lg">{v("Подберите цвет пакета под Ваш заказ!", "Подбери цвет пакета под свой заказ!")}</p>
        <div className="mt-3 flex gap-2">
          {colors.map((c) => <Bag key={c.code} c={c} onClick={() => choose("BAG", c.code)} />)}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => choose("BAG", null)} className={button}>Любой цвет</button>
          {fitting && (
            <button onClick={() => choose(fitting.code, null)} className={button}>
              Хочу коробочку{fitting.capacity_slots !== null && fitting.price_cents > 0 ? ` · ${rub(fitting.price_cents)}` : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
