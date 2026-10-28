"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ButlerHero from "@/components/ButlerHero";
import { setGift } from "@/lib/cart";

type Choice = { code: string; name: string };
type Tag = { id: number; name: string };
type Step = "who" | "recipient" | "occasion" | "mood";

const answer = "rounded-2xl border border-line bg-paper-2 px-4 py-3 text-left transition hover:border-wine";

export default function Concierge() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("who");
  const [gift, setIsGift] = useState(false);
  const [recipient, setRecipient] = useState<Choice | null>(null);
  const [recipients, setRecipients] = useState<Choice[]>([]);
  const [occasions, setOccasions] = useState<Choice[]>([]);
  const [anchors, setAnchors] = useState<Tag[]>([]);

  useEffect(() => {
    fetch("/api/recipients").then((r) => r.json()).then(setRecipients).catch(() => {});
    fetch("/api/occasions").then((r) => r.json()).then(setOccasions).catch(() => {});
    fetch("/api/tags").then((r) => r.json()).then(setAnchors).catch(() => {});
  }, []);

  // what the butler says at each step
  const lines: Record<Step, string> = {
    who: "Добро пожаловать. Для себя или в подарок?",
    recipient: "Подарок, прекрасно. Кому?",
    occasion: `${recipient?.name ?? "Им"}… А по какому поводу?`,
    mood: gift ? "Тогда начнём с книги. Какое у неё настроение?" : "Какое настроение у вечера?",
  };

  // where "назад" leads from each step
  const back: Record<Step, Step> = { who: "who", recipient: "who", occasion: "recipient", mood: gift ? "occasion" : "who" };

  // on to the sommelier, with the chosen genre already selected (or none, for "удиви меня")
  function toSommelier(anchorId?: number) {
    router.push(anchorId ? `/sommelier?anchor=${anchorId}` : "/sommelier");
  }

  return (
    <div className="pt-2">
      {/* key={step}: a new step remounts the hero, so a bunny interruption ends there */}
      <ButlerHero key={step} say={lines[step]} />

      <div className="mt-4 grid grid-cols-2 gap-2">
        {step === "who" && (
          <>
            <button className={answer} onClick={() => { setIsGift(false); setGift({ gift: false }); setStep("mood"); }}>
              Для себя
            </button>
            <button className={answer} onClick={() => { setIsGift(true); setStep("recipient"); }}>
              В подарок
            </button>
          </>
        )}

        {step === "recipient" && recipients.map((c) => (
          <button key={c.code} className={answer} onClick={() => { setRecipient(c); setStep("occasion"); }}>
            {c.name}
          </button>
        ))}

        {step === "occasion" && occasions.map((c) => (
          <button key={c.code} className={answer} onClick={() => {
            // remembered in the cart, so the pairing steps later don't ask again
            setGift({ gift: true, recipient: recipient?.code, recipientName: recipient?.name, occasion: c.code, occasionName: c.name });
            setStep("mood");
          }}>
            {c.name}
          </button>
        ))}

        {step === "mood" && (
          <>
            {anchors.map((a) => (
              <button key={a.id} className={answer} onClick={() => toSommelier(a.id)}>{a.name}</button>
            ))}
            <button className={`${answer} col-span-2 border-wine text-wine`} onClick={() => toSommelier()}>
              Удиви меня
            </button>
          </>
        )}
      </div>

      {step !== "who" && (
        <button onClick={() => setStep(back[step])} className="mt-4 font-sans text-sm text-muted">← назад</button>
      )}

      {/* the quiet escape hatch: a plain form, so it works even before JavaScript loads */}
      <form action="/search" className="mt-12">
        <p className="mb-2 text-center font-sans text-xs text-muted">Знаете, что ищете?</p>
        <input name="q" type="search" placeholder="Название, автор, «цветы»…"
          className="w-full rounded-full border border-line bg-paper-2 px-5 py-3 font-sans outline-none focus:border-wine" />
      </form>
    </div>
  );
}
