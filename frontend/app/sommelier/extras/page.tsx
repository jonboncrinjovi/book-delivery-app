"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addItem, setCard, useCart } from "@/lib/cart";

type Suggestion = { id: number; category: string; name: string; description: string; price_cents: number; slots: number; image: string | null; note: string };
type Design = { id: number; kind: string; name: string; image_path: string | null; is_custom: boolean; price_cents: number };

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;
const TORN = "polygon(0 6%, 4% 0, 9% 5%, 15% 1%, 21% 6%, 27% 2%, 33% 5%, 40% 0, 46% 6%, 53% 2%, 60% 5%, 66% 1%, 73% 6%, 80% 2%, 86% 5%, 93% 0, 100% 5%, 100% 100%, 0 100%)";
const pill = "rounded-full bg-[#57030d] px-4 py-2.5 font-sans text-sm text-[#f4ead6] shadow-md transition active:scale-95 disabled:opacity-40";

export default function ExtrasPage() {
  const router = useRouter();
  const cart = useCart();
  const [sheet, setSheet] = useState<"flowers" | "card" | null>(null);

  const flowers = cart.items.find((i) => i.category === "flowers");
  const book = cart.items.find((i) => i.category === "book");
  // the customer's own designs, printed to order
  const ownCard = cart.items.find((i) => i.print && i.name.includes("открытка"));
  const ownWrap = cart.items.find((i) => i.print && i.name.includes("упаковка"));

  // one question row: the + turns into ✓ and a name once something is chosen
  const row = (question: string, chosen: string | undefined, open: () => void) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xl">{question}</span>
      <button onClick={open}
        className={chosen ? "max-w-[50%] truncate rounded-md border border-[#57030d] px-3 py-1.5 font-sans text-sm text-[#57030d]"
          : "flex h-9 w-14 items-center justify-center rounded-md bg-[#57030d] text-2xl text-[#f4ead6] shadow"}>
        {chosen ? `✓ ${chosen}` : "+"}
      </button>
    </div>
  );

  const cardChosen = ownCard ? "своя открытка" : cart.card ? (cart.card.name ?? "от руки") : undefined;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl text-black">
      {/* the box, as a photo (or plain kraft until it exists) */}
      <div className="min-h-0 flex-1 bg-[#c9a77a] bg-cover bg-center" style={{ backgroundImage: "url(/wrap/box.jpg)" }} />

      <div className="-mt-4 shrink-0 space-y-4 bg-[#f4ead6] px-5 pb-5 pt-8" style={{ clipPath: TORN }}>
        {row("Добавить цветы?", flowers?.name, () => setSheet("flowers"))}
        {flowers && (
          <Link href="/print/wrap" className="-mt-2 block text-right font-sans text-sm text-[#57030d] underline underline-offset-2">
            {ownWrap ? "✓ своя упаковка для цветов" : "+ своя упаковка для цветов"}
          </Link>
        )}
        {row("Добавить открытку?", cardChosen, () => setSheet("card"))}
        <button onClick={() => router.push("/checkout")} className={`${pill} w-full py-3 text-base`}>К оформлению</button>
      </div>

      {sheet === "flowers" && <FlowersSheet bookId={book?.id ?? 0} onClose={() => setSheet(null)} />}
      {sheet === "card" && <CardSheet onClose={() => setSheet(null)} />}
    </div>
  );
}

// the sommelier's flower suggestion, laid over the page
function FlowersSheet({ bookId, onClose }: { bookId: number; onClose: () => void }) {
  const [s, setS] = useState<Suggestion | null>(null);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams({ book: String(bookId), category: "flowers", exclude: excluded.join(",") });
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
  }, [bookId, excluded]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#c9a77a] p-4 motion-safe:animate-swoop">
      <div className="flex min-h-0 flex-1 flex-col bg-[#f4ead6] p-2 shadow-lg" style={{ rotate: "1deg" }}>
        <div className="min-h-0 flex-1 overflow-hidden">
          {s?.image
            ? <img src={s.image} alt={s.name} className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center bg-[#6b1f2b] p-6 text-center text-2xl text-[#f4ead6]">
                {s ? s.name : empty ? "Цветов сейчас нет." : "Сомелье выбирает…"}
              </div>}
        </div>
        {s && (
          <p className="shrink-0 px-2 pt-2 font-hand text-xl leading-snug">
            {s.name}. {s.note || s.description} · {rub(s.price_cents)}
          </p>
        )}
      </div>
      <div className="mt-4 grid shrink-0 grid-cols-3 gap-2">
        <button onClick={onClose} className={pill}>Не нужно</button>
        <button onClick={() => s && setExcluded([...excluded, s.id])} disabled={!s} className={pill}>Другие</button>
        <button disabled={!s} className={pill} onClick={() => {
          if (!s) return;
          addItem({ id: s.id, name: s.name, category: s.category, price_cents: s.price_cents, slots: s.slots });
          onClose();
        }}>Добавить</button>
      </div>
    </div>
  );
}

// card designs and the text to write in it, or the customer's own card
function CardSheet({ onClose }: { onClose: () => void }) {
  const [cards, setCards] = useState<Design[]>([]);
  const [picked, setPicked] = useState<Design | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    fetch("/api/cards").then((r) => r.json()).then(setCards).catch(() => {});
  }, []);

  return (
    <div className="absolute inset-0 z-20 flex flex-col gap-3 bg-[#f4ead6] p-4 motion-safe:animate-swoop">
      <p className="shrink-0 text-xl">Открытка</p>
      <Link href="/print/card" className={`${pill} shrink-0 text-center`}>Сделать свою открытку с фото →</Link>
      <p className="shrink-0 text-center font-sans text-xs opacity-60">или выберите готовую</p>
      {cards.length > 0 ? (
        <div className="grid min-h-0 shrink grid-cols-3 gap-2 overflow-y-auto">
          {cards.map((c) => (
            <button key={c.id} onClick={() => setPicked(c)}
              className={`rounded-md border bg-white p-1 text-left ${picked?.id === c.id ? "border-[#57030d] ring-2 ring-[#57030d]" : "border-black/20"}`}>
              {c.image_path && <img src={c.image_path} alt="" className="aspect-[3/4] w-full object-cover" />}
              <span className="block truncate font-sans text-[11px]">{c.name}</span>
              <span className="font-sans text-[10px] opacity-60">{rub(c.price_cents)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="shrink-0 font-sans text-sm opacity-70">Напишите пару слов, и мы подпишем открытку от руки.</p>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300}
        placeholder="Что написать?"
        className="min-h-24 flex-1 resize-none rounded-md border border-black/20 bg-white p-3 font-hand text-xl outline-none" />
      <p className="-mt-2 shrink-0 text-right font-sans text-xs opacity-60">{text.length}/300</p>
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <button onClick={() => { setCard(undefined); onClose(); }} className={pill}>Без открытки</button>
        <button disabled={cards.length > 0 ? !picked : text.trim() === ""} className={pill} onClick={() => {
          setCard({ id: picked?.id, name: picked?.name, price_cents: picked?.price_cents ?? 0, text });
          onClose();
        }}>Добавить</button>
      </div>
    </div>
  );
}
