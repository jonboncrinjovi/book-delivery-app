"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addItem, setCard, setGift } from "@/lib/cart";

type Choice = { code: string; name: string };
type Suggestion = {
  id: number; category: string; name: string; description: string;
  price_cents: number; slots: number; image: string | null; note: string;
};
type Design = { id: number; kind: string; name: string; image_path: string | null; is_custom: boolean; price_cents: number };
type Pairing = "drink" | "snack" | "flowers";
type Step = "who" | "recipient" | "occasion" | Pairing | "card";

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;

const pairTitles: Record<Pairing, string> = {
  drink: "Что налить к этой книге?",
  snack: "А к чему потянется рука?",
  flowers: "И цветы, чтобы точно запомнилось",
};

// the route through the questions depends on the first answer
const routes: Record<"self" | "gift", Step[]> = {
  self: ["who", "drink", "snack"],
  gift: ["who", "recipient", "occasion", "drink", "snack", "flowers", "card"],
};

export default function Wizard({ bookId }: { bookId: number }) {
  const router = useRouter(); // lets code navigate, like clicking a link
  const [route, setRoute] = useState<Step[]>(routes.self);
  const [step, setStep] = useState<Step>("who");
  const [recipients, setRecipients] = useState<Choice[]>([]);
  const [occasions, setOccasions] = useState<Choice[]>([]);
  const [recipient, setRecipient] = useState<Choice | null>(null);
  const [occasion, setOccasion] = useState<string | undefined>();

  useEffect(() => {
    fetch("/api/recipients").then((r) => r.json()).then(setRecipients).catch(() => {});
    fetch("/api/occasions").then((r) => r.json()).then(setOccasions).catch(() => {});
  }, []);

  // move to the step after the current one; after the last, to the cart
  function next(r: Step[] = route) {
    const i = r.indexOf(step);
    if (i + 1 < r.length) setStep(r[i + 1]);
    else router.push("/cart");
  }

  const button = "w-full rounded-2xl border border-line bg-paper-2 px-5 py-4 text-left text-lg transition hover:border-wine";

  return (
    <div className="pt-4">
      {step === "who" && (
        <>
          <h1 className="text-3xl font-bold">Для себя или в подарок?</h1>
          <div className="mt-6 space-y-3">
            <button className={button} onClick={() => {
              setGift({ gift: false });
              setRoute(routes.self);
              next(routes.self);
            }}>Для себя</button>
            <button className={button} onClick={() => {
              setRoute(routes.gift);
              next(routes.gift);
            }}>В подарок</button>
          </div>
        </>
      )}

      {step === "recipient" && (
        <>
          <h1 className="text-3xl font-bold">Кому?</h1>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {recipients.map((c) => (
              <button key={c.code} className={button} onClick={() => { setRecipient(c); next(); }}>{c.name}</button>
            ))}
          </div>
        </>
      )}

      {step === "occasion" && (
        <>
          <h1 className="text-3xl font-bold">По какому поводу?</h1>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {occasions.map((c) => (
              <button key={c.code} className={button} onClick={() => {
                setOccasion(c.code);
                setGift({
                  gift: true,
                  recipient: recipient?.code, recipientName: recipient?.name,
                  occasion: c.code, occasionName: c.name,
                });
                next();
              }}>{c.name}</button>
            ))}
          </div>
        </>
      )}

      {(step === "drink" || step === "snack" || step === "flowers") && (
        // key={step}: a new step gets a fresh PairStep, with its own empty "already shown" list
        <PairStep key={step} bookId={bookId} category={step} occasion={occasion}
          title={pairTitles[step]} onDone={() => next()} />
      )}

      {step === "card" && <CardStep occasion={occasion} onDone={() => router.push("/cart")} />}

      <button onClick={() => router.push("/cart")} className="mt-10 block w-full text-center font-sans text-sm text-muted underline">
        Пропустить всё и перейти в корзину
      </button>
    </div>
  );
}

function PairStep({ bookId, category, occasion, title, onDone }: {
  bookId: number; category: Pairing; occasion?: string; title: string; onDone: () => void;
}) {
  const [s, setS] = useState<Suggestion | null>(null);
  const [excluded, setExcluded] = useState<number[]>([]); // "Предложи ещё" adds the current one here
  const [empty, setEmpty] = useState(false);

  // runs again whenever excluded changes: that IS the "Предложи ещё" button
  useEffect(() => {
    const q = new URLSearchParams({ book: String(bookId), category, exclude: excluded.join(",") });
    if (occasion) q.set("occasion", occasion);
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
  }, [bookId, category, occasion, excluded]);

  return (
    <>
      <h1 className="text-3xl font-bold">{title}</h1>
      {empty && (
        <div className="mt-6">
          <p className="font-sans text-muted">Здесь сомелье пока нечего предложить.</p>
          <button onClick={onDone} className="mt-4 rounded-full bg-wine px-6 py-3 font-sans text-paper-2">Дальше</button>
        </div>
      )}
      {!empty && !s && <p className="mt-6 font-sans text-muted">Сомелье думает…</p>}
      {s && (
        <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-paper-2 motion-safe:animate-swoop">
          {s.image && <img src={s.image} alt="" className="aspect-square w-full object-cover" />}
          <div className="p-4">
            <p className="text-xl font-bold">{s.name}</p>
            {s.note && <p className="mt-2 italic">«{s.note}»</p>}
            <p className="mt-3 font-sans text-sm">{rub(s.price_cents)}</p>
          </div>
        </div>
      )}
      {s && (
        <div className="mt-5 grid gap-2 font-sans">
          <button onClick={() => {
            addItem({ id: s.id, name: s.name, category: s.category, price_cents: s.price_cents, slots: s.slots });
            onDone();
          }} className="rounded-full bg-wine px-6 py-3 text-paper-2">Добавить</button>
          <button onClick={() => setExcluded([...excluded, s.id])} className="rounded-full border border-wine px-6 py-3 text-wine">Предложи ещё</button>
          <button onClick={onDone} className="px-6 py-3 text-muted">Пропустить</button>
        </div>
      )}
    </>
  );
}

function CardStep({ occasion, onDone }: { occasion?: string; onDone: () => void }) {
  const [cards, setCards] = useState<Design[]>([]);
  const [picked, setPicked] = useState<Design | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    fetch(`/api/cards?occasion=${occasion ?? ""}`).then((r) => r.json()).then(setCards).catch(() => {});
  }, [occasion]);

  return (
    <>
      <h1 className="text-3xl font-bold">Открытка</h1>
      {cards.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <button key={c.id} onClick={() => setPicked(c)}
              className={`rounded-2xl border bg-paper-2 p-3 text-left ${picked?.id === c.id ? "border-wine ring-2 ring-wine" : "border-line"}`}>
              {c.image_path && <img src={c.image_path} alt="" className="mb-2 aspect-[3/4] w-full rounded-xl object-cover" />}
              <span className="block">{c.name}</span>
              <span className="font-sans text-sm text-muted">{rub(c.price_cents)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-6 font-sans text-muted">Открытки скоро появятся. Напиши пару слов, и мы подпишем от руки.</p>
      )}

      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={4}
        placeholder="Что написать?"
        className="mt-5 w-full rounded-2xl border border-line bg-paper-2 p-4 font-sans outline-none focus:border-wine" />
      <p className="text-right font-sans text-xs text-muted">{text.length}/300</p>

      <div className="mt-3 grid gap-2 font-sans">
        <button
          disabled={cards.length > 0 ? !picked : text.trim() === ""}
          onClick={() => {
            setCard({ id: picked?.id, name: picked?.name, price_cents: picked?.price_cents ?? 0, text });
            onDone();
          }}
          className="rounded-full bg-wine px-6 py-3 text-paper-2 disabled:opacity-40">
          Добавить открытку
        </button>
        <button onClick={() => { setCard(undefined); onDone(); }} className="px-6 py-3 text-muted">Без открытки</button>
      </div>
    </>
  );
}
