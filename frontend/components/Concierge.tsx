"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ButlerHero from "@/components/ButlerHero";
import { setGift } from "@/lib/cart";

type Choice = { code: string; name: string };
type Tag = { id: number; name: string };
type Step = "who" | "recipient" | "occasion" | "mood";

// compact answer chips, so more of them fit in the strip below the picture
const answer = "rounded-full border border-line bg-paper-2 px-3 py-2 text-sm transition hover:border-wine";

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

  const lines: Record<Step, string> = {
    who: "Итак, приступим. Для себя или в подарок?",
    recipient: "Подарок, прекрасно. Кому?",
    occasion: `${recipient?.name ?? "Им"}… А по какому поводу?`,
    mood: gift ? "Тогда начнём с книги. Какое у неё настроение?" : "Какое настроение у вечера?",
  };

  const back: Record<Step, Step> = { who: "who", recipient: "who", occasion: "recipient", mood: gift ? "occasion" : "who" };

  function toPicking(anchorId?: number) {
    router.push(anchorId ? `/sommelier/pick?anchor=${anchorId}` : "/sommelier/pick");
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-0 flex-1">
        <ButlerHero key={step} lines={[lines[step]]} />
      </div>

      {/* the answers: at most ~40% of the card; only this strip scrolls when there are many */}
      <div className="max-h-[40%] shrink-0 overflow-y-auto overscroll-contain">
        <div className="flex flex-wrap justify-center gap-2">
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
              setGift({ gift: true, recipient: recipient?.code, recipientName: recipient?.name, occasion: c.code, occasionName: c.name });
              setStep("mood");
            }}>
              {c.name}
            </button>
          ))}

          {step === "mood" && (
            <>
              {anchors.map((a) => (
                <button key={a.id} className={answer} onClick={() => toPicking(a.id)}>{a.name}</button>
              ))}
              <button className={`${answer} border-wine text-wine`} onClick={() => toPicking()}>Удиви меня</button>
            </>
          )}
        </div>
      </div>

      {step !== "who" && (
        <button onClick={() => setStep(back[step])} className="shrink-0 font-sans text-sm text-muted">← назад</button>
      )}
    </div>
  );
}
