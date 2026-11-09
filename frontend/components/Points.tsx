"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { plural } from "@/components/Vintorina";

const WINE = "#57030d";

// the player's книвиночки, on the profile; nothing for guests
export default function Points() {
  const [p, setP] = useState<{ total: number; today: number } | null>(null);
  useEffect(() => {
    fetch("/api/me/points").then((r) => (r.ok ? r.json() : null)).then(setP).catch(() => {});
  }, []);
  if (!p) return null;
  return (
    <Link href="/shelf" className="mb-3 block rounded-xl bg-[#f4ead6] p-4 text-black shadow-sm">
      <p className="font-sans text-xs uppercase tracking-wide opacity-60">Мои книвиночки</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-4xl" style={{ color: WINE }}>{p.total.toLocaleString("ru-RU")}</span>
        <span className="text-lg">{plural(p.total, ["книвиночка", "книвиночки", "книвиночек"])}</span>
      </p>
      <p className="mt-1 font-sans text-xs opacity-70">
        {p.today > 0 ? `Сегодня +${p.today} · ` : ""}10 книвиночек = 1 ₽ скидки · обмен откроется совсем скоро
      </p>
    </Link>
  );
}
