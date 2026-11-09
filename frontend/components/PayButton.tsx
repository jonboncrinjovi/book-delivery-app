"use client";

import { useEffect, useState } from "react";

// the order's payment: «Оплатить» while it's due; after returning from the bank, an immediate check
export default function PayButton({ token }: { token: string }) {
  const [info, setInfo] = useState<{ enabled: boolean; due: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    (async () => {
      if (p.has("paid")) await fetch(`/api/track/${token}/check`, { method: "POST" }).catch(() => {});
      if (p.has("failed")) setMsg("Оплата не прошла. Можно попробовать ещё раз.");
      const r = await fetch(`/api/track/${token}/pay`);
      if (r.ok) setInfo(await r.json());
    })();
  }, [token]);

  if (!info?.enabled || !info.due) return null;

  async function pay() {
    setBusy(true);
    setMsg("");
    const r = await fetch(`/api/track/${token}/pay`, { method: "POST" });
    if (r.ok) {
      const { url } = await r.json();
      window.location.href = url;
      return;
    }
    setMsg((await r.text()).trim());
    setBusy(false);
  }

  return (
    <div className="my-3 space-y-2 text-center">
      <button onClick={pay} disabled={busy}
        className="w-full rounded-full bg-[#57030d] py-3 text-lg text-[#f4ead6] shadow-md transition active:scale-95 disabled:opacity-50">
        {busy ? "Переходим к оплате…" : "Оплатить"}
      </button>
      <p className="font-sans text-xs text-muted">Картой, через СБП или T-Pay. Чек придёт на телефон.</p>
      {msg && <p className="font-sans text-sm text-wine">{msg}</p>}
    </div>
  );
}
