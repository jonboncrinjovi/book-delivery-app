"use client";

import { useEffect, useState } from "react";

const KEY = "receipt_email";
const AMOUNTS = [100, 200, 300];
const WINE = "#57030d";
const CREAM = "#f4ead6";

// the tip: three amounts or one's own, the receipt email, then Точка's payment page
export default function TipBox({ token }: { token: string }) {
  const [amount, setAmount] = useState(200);
  const [custom, setCustom] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    try {
      setEmail(localStorage.getItem(KEY) ?? "");
    } catch {}
  }, []);

  const value = custom ? Number(custom) : amount;

  async function tip() {
    setBusy(true);
    setMsg("");
    try {
      localStorage.setItem(KEY, email.trim());
    } catch {}
    const r = await fetch(`/api/track/${token}/tip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: value, email: email.trim() }),
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
    <div className="mt-3 space-y-2">
      <p className="font-sans text-sm">Чаевые нашей маленькой команде. Спасибо, это очень приятно!</p>
      <div className="grid grid-cols-4 gap-2 font-sans text-sm">
        {AMOUNTS.map((a) => (
          <button key={a} onClick={() => { setAmount(a); setCustom(""); }}
            className="rounded-full border py-2"
            style={!custom && amount === a ? { background: WINE, color: CREAM, borderColor: WINE } : { borderColor: WINE, color: WINE }}>
            {a} ₽
          </button>
        ))}
        <input type="number" inputMode="numeric" min={50} max={10000} placeholder="Своя" value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="min-w-0 rounded-full border bg-white px-3 py-2 text-center outline-none" style={{ borderColor: WINE }} />
      </div>
      <input type="email" inputMode="email" autoComplete="email" placeholder="E-mail для чека" value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-black/20 bg-white p-3 font-sans text-[15px] text-black outline-none focus:border-[#57030d]" />
      <button onClick={tip} disabled={busy || !email.includes("@") || !(value >= 50)}
        className="w-full rounded-full py-3 text-lg shadow-md transition active:scale-95 disabled:opacity-50"
        style={{ background: WINE, color: CREAM }}>
        {busy ? "Переходим к оплате…" : `Оставить ${value || 0} ₽`}
      </button>
      <p className="font-sans text-xs opacity-70">Если включён VPN, отключите его перед оплатой: банки отклоняют платежи с иностранных адресов.</p>
      {msg && <p className="font-sans text-sm" style={{ color: WINE }}>{msg}</p>}
    </div>
  );
}

// after returning from the tip payment: check it with the bank and say thank you
export function TipThanks({ token }: { token: string }) {
  const [state, setState] = useState<"" | "paid" | "failed">("");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has("tipfailed")) setState("failed");
    if (!p.has("tip")) return;
    fetch(`/api/track/${token}/tipcheck`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => d.paid && setState("paid"))
      .catch(() => {});
  }, [token]);
  if (!state) return null;
  return (
    <p className="mt-1 font-sans text-sm" style={{ color: WINE }}>
      {state === "paid" ? "Чаевые получены. Огромное спасибо!" : "Оплата чаевых не прошла. Можно попробовать ещё раз."}
    </p>
  );
}
