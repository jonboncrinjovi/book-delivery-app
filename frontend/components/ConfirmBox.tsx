"use client";

import { useEffect, useState } from "react";
import { useV } from "@/lib/address";

type Info = { confirmed: boolean; word: string | null; url: string | null };

// the Telegram confirmation on the tracking page: the button before, the password after
export function ConfirmBox({ token, status }: { token: string; status: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const v = useV();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const load = () =>
      fetch(`/api/track/${token}/confirm`).then((r) => r.json()).then((i: Info) => {
        setInfo(i);
        if (i.confirmed) clearInterval(timer);
      }).catch(() => {});
    load();
    timer = setInterval(load, 10_000); // they confirm in Telegram, then come back here
    return () => clearInterval(timer);
  }, [token]);

  if (!info) return null;

  if (info.confirmed && info.word) {
    return (
      <div className="rounded-md border border-[#57030d] p-3">
        <p className="font-sans text-xs uppercase tracking-wide opacity-60">Пароль для курьера</p>
        <p className="text-2xl" style={{ color: "#57030d" }}>«{info.word}»</p>
        <p className="font-sans text-xs opacity-70">{v("Курьер спросит его при доставке. Если это подарок, передайте пароль получателю.", "Курьер спросит его при доставке. Если это подарок, передай пароль получателю.")}</p>
      </div>
    );
  }

  const waiting = status === "awaiting_payment" || status === "awaiting_quote";
  if (!waiting || !info.url) return null;
  return (
    <div className="space-y-1">
      <a href={info.url} target="_blank" rel="noopener noreferrer"
        className="block rounded-full bg-[#57030d] px-5 py-2 text-center font-sans text-[#f4ead6]">
        Подтвердить в Telegram
      </a>
      <p className="text-center font-sans text-xs opacity-60">без подтверждения заказ отменится через 2 часа</p>
    </div>
  );
}
