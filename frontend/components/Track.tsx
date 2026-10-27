"use client";

import { useEffect, useState } from "react";

type Tracking = {
  id: number; status: string; delivery_type: string; deliver_by: string;
  total_cents: number; created_at: string;
  items: { name: string; quantity: number }[];
  events: { status: string; at: string }[];
};

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;
const time = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

// the four stamps, and which stamp each database status reaches
const steps = ["Принят", "Собираем", "В пути", "Доставлен"];
const stepOf: Record<string, number> = {
  awaiting_quote: 0, awaiting_payment: 0, paid: 0, packing: 1, on_the_way: 2, delivered: 3,
};
const eventStep: Record<string, number> = { packing: 1, on_the_way: 2, delivered: 3 };

export default function Track({ token }: { token: string }) {
  const [t, setT] = useState<Tracking | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch(`/api/track/${token}`)
        .then(async (r) => {
          if (r.status === 404) {
            setMissing(true);
            return;
          }
          if (r.ok) setT(await r.json());
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 30000); // check for news every 30 seconds
    return () => clearInterval(timer);
  }, [token]);

  if (missing) return <p className="pt-10 text-center font-sans text-muted">Заказ не найден.</p>;
  if (!t) return <p className="pt-10 text-center font-sans text-muted">Загрузка…</p>;

  const cancelled = t.status === "cancelled";
  const current = stepOf[t.status] ?? 0;
  // the time each stamp was reached: "Принят" when the order was made, the rest from the events
  const stampTimes: (string | undefined)[] = [t.created_at];
  for (const e of t.events) if (eventStep[e.status] !== undefined) stampTimes[eventStep[e.status]] = e.at;

  return (
    <div className="pt-4">
      <h1 className="text-3xl font-bold">Заказ №{t.id}</h1>
      {cancelled ? (
        <p className="mt-2 font-sans text-wine">Заказ отменён.</p>
      ) : (
        <p className="mt-2 font-sans text-muted">Привезём до: {when(t.deliver_by)}</p>
      )}

      {!cancelled && (
        <ol className="mt-8 space-y-5">
          {steps.map((label, i) => {
            const done = i <= current;
            return (
              <li key={label} className="flex items-center gap-4">
                {/* a stamp: filled wine red once reached */}
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-sans text-sm ${
                  done ? "border-wine bg-wine text-paper-2" : "border-line text-muted"}`}>
                  {i + 1}
                </span>
                <span className={done ? "text-lg" : "text-lg text-muted"}>{label}</span>
                {stampTimes[i] && done && (
                  <span className="ml-auto font-sans text-sm text-muted">{time(stampTimes[i]!)}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <ul className="mt-8 divide-y divide-line rounded-2xl border border-line bg-paper-2">
        {t.items.map((i, n) => (
          <li key={n} className="flex justify-between p-4">
            <span>{i.name}</span>
            <span className="font-sans text-muted">× {i.quantity}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-right text-xl font-bold">{rub(t.total_cents)}</p>
      <p className="mt-6 font-sans text-xs text-muted">Страница обновляется сама. Сохрани ссылку, чтобы вернуться.</p>
    </div>
  );
}
