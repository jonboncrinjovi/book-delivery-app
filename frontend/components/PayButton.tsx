"use client";

import { useEffect, useState } from "react";

const KEY = "receipt_email";

// the order's payment: an email for the receipt and «Оплатить» while it's due;
// after returning from the bank, an immediate check
export default function PayButton({ token }: { token: string }) {
  const [info, setInfo] = useState<{ enabled: boolean; due: boolean } | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    try {
      setEmail(localStorage.getItem(KEY) ?? "");
    } catch {}
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
    try {
      localStorage.setItem(KEY, email.trim());
    } catch {}
    const r = await fetch(`/api/track/${token}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
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
      <input type="email" inputMode="email" autoComplete="email" placeholder="E-mail для чека"
        value={email} onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-black/20 bg-white p-3 font-sans text-[15px] text-black outline-none focus:border-[#57030d]" />
      <button onClick={pay} disabled={busy || !email.includes("@")}
        className="w-full rounded-full bg-[#57030d] py-3 text-lg text-[#f4ead6] shadow-md transition active:scale-95 disabled:opacity-50">
        {busy ? "Переходим к оплате…" : "Оплатить"}
      </button>
      <p className="font-sans text-xs text-muted">Картой, через СБП или T-Pay. Чек придёт на этот адрес.</p>
      {msg && <p className="font-sans text-sm text-wine">{msg}</p>}
    </div>
  );
}
