"use client";

import { useEffect, useState } from "react";

type Info = { confirmed: boolean; word: string | null; url: string | null };

// the Telegram confirmation on the tracking page: the button before, the password after
export function ConfirmBox({ token, status }: { token: string; status: string }) {
  const [info, setInfo] = useState<Info | null>(null);

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
      <div className="rounded-md border border-[#7a1f2b] p-3">
        <p className="font-sans text-xs uppercase tracking-wide opacity-60">Пароль для курьера</p>
        <p className="text-2xl" style={{ color: "#7a1f2b" }}>«{info.word}»</p>
        <p className="font-sans text-xs opacity-70">Курьер спросит его при доставке. Если это подарок, передайте пароль получателю.</p>
      </div>
    );
  }

  const waiting = status === "awaiting_payment" || status === "awaiting_quote";
  if (!waiting || !info.url) return null;
  return (
    <div className="space-y-1">
      <a href={info.url} target="_blank" rel="noopener noreferrer"
        className="block rounded-full bg-[#7a1f2b] px-5 py-2 text-center font-sans text-[#f4ead6]">
        Подтвердить в Telegram
      </a>
      <p className="text-center font-sans text-xs opacity-60">без подтверждения заказ отменится через 2 часа</p>
    </div>
  );
}
