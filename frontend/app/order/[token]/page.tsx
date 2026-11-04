"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ConfirmBox } from "@/components/ConfirmBox";

type Track = {
  id: number;
  status: string;
  delivery_type: string;
  deliver_by: string;
  total_cents: number;
  created_at: string;
  items: { name: string; quantity: number }[];
  events: { status: string; at: string }[];
};

const WINE = "#7a1f2b";
const CREAM = "#f4ead6";

// every status in the order an order goes through; a step counts as reached once the order gets there
const ORDER = ["awaiting_quote", "awaiting_payment", "paid", "packing", "on_the_way", "delivered"];

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;
const short = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

// the icons: simple shapes in the current text colour, so one drawing works on both stamp colours
const Coin = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <path d="M10 17V7h3.5a2.5 2.5 0 0 1 0 5H8.5M8.5 14.5h5" />
  </svg>
);
const Box = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M12 2.5 3.5 7v10l8.5 4.5 8.5-4.5V7z" />
    <path d="m3.5 7 8.5 4.5L20.5 7M12 11.5v10" />
  </svg>
);
const Truck = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor">
    <path d="M1 5h13v11H1zM15 8h4l4 4v4h-8z" />
    <circle cx="5.5" cy="17.5" r="2.3" />
    <circle cx="18.5" cy="17.5" r="2.3" />
  </svg>
);
const HeartBook = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <path fill="currentColor" d="M12 21s-8.5-5.3-8.5-11.2A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 8.5 2.6C20.5 15.7 12 21 12 21z" />
    <path fill="none" stroke={filled ? WINE : CREAM} strokeWidth="1.3" d="M7.5 10.5q2.2-1.2 4.5 0q2.3-1.2 4.5 0v4q-2.2-1.2-4.5 0q-2.3-1.2-4.5 0zM12 10.5v4" />
  </svg>
);

const STEPS = [
  { status: "paid", label: "Оплачен", icon: () => <Coin /> },
  { status: "packing", label: "Собираем", icon: () => <Box /> },
  { status: "on_the_way", label: "В пути", icon: () => <Truck /> },
  { status: "delivered", label: "Доставлен", icon: (f: boolean) => <HeartBook filled={f} /> },
];

// a postage stamp: the outer layer is a grid of holes, the inner layer covers all but its rim,
// so only the edge looks perforated and the kraft shows through the holes
function Stamp({ filled, children }: { filled: boolean; children: React.ReactNode }) {
  const c = filled ? WINE : CREAM;
  return (
    <div
      className="h-16 w-24 p-[5px] transition-colors duration-500"
      style={{ background: `radial-gradient(circle, transparent 2.5px, ${c} 3px) -4px -4px / 8px 8px` }}
    >
      <div className="flex h-full w-full items-center justify-center" style={{ background: c, color: filled ? CREAM : WINE }}>
        {children}
      </div>
    </div>
  );
}

export default function TrackPage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<Track | null>(null);
  const [missing, setMissing] = useState(false);

  // load now, then every 30 seconds until the order reaches a final state
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    async function load() {
      const res = await fetch(`/api/track/${token}`);
      if (!res.ok) {
        setMissing(true);
        return;
      }
      const o: Track = await res.json();
      setOrder(o);
      if (o.status === "delivered" || o.status === "cancelled") clearInterval(timer);
    }
    load();
    timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [token]);

  if (missing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="text-xl">Такого заказа мы не нашли</p>
        <Link href="/" className="rounded-full bg-wine px-6 py-3 font-sans text-paper-2">На главную</Link>
      </div>
    );
  }
  if (!order) return <div className="h-full" />;

  const cancelled = order.status === "cancelled";
  const reachedIndex = ORDER.indexOf(order.status); // -1 when cancelled
  const reached = (status: string) => !cancelled && reachedIndex >= ORDER.indexOf(status);
  const eventAt = (status: string) => [...order.events].reverse().find((e) => e.status === status)?.at;

  return (
    <div className="flex h-full flex-col items-center gap-4 overflow-hidden rounded-xl bg-[#cdb08a] p-4 text-black">
      <h1 className="shrink-0 rounded-md px-4 py-1 text-2xl shadow-md" style={{ background: WINE, color: CREAM }}>
        Статус Вашего заказа:
      </h1>

      {/* the progress column */}
      <div className={`flex shrink-0 flex-col items-center ${cancelled ? "opacity-40" : ""}`}>
        {STEPS.map((s, i) => {
          const done = reached(s.status);
          const at = eventAt(s.status);
          const next = STEPS[i + 1];
          return (
            <div key={s.status} className="flex flex-col items-center">
              <div className="relative">
                <Stamp filled={done}>{s.icon(done)}</Stamp>
                {/* the caption sits beside the stamp, so the column stays centred */}
                <div className="absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap font-sans text-xs leading-tight">
                  <p className={done ? "font-semibold" : "opacity-60"}>{s.label}</p>
                  {done && at && <p className="opacity-70">{short(at)}</p>}
                </div>
              </div>
              {next && (
                <div className="h-5 w-[2px] transition-colors duration-500"
                  style={{ background: reached(next.status) ? WINE : "rgba(122,31,43,0.3)" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* the card at the bottom changes with the status */}
      <div className="min-h-0 w-full flex-1 overflow-y-auto rounded-md p-4 shadow-md" style={{ background: CREAM }}>
        {cancelled ? (
          <div className="space-y-3">
            <p className="text-xl" style={{ color: WINE }}>Заказ отменён</p>
            <p className="font-sans text-sm opacity-70">Если это ошибка, напишите нам, и мы всё исправим.</p>
            <Link href="/sommelier" className="inline-block rounded-full px-5 py-2 font-sans text-sm" style={{ background: WINE, color: CREAM }}>
              К сомелье
            </Link>
          </div>
        ) : order.status === "delivered" ? (
          <div className="flex h-full flex-col">
            <p className="text-xl" style={{ color: WINE }}>Будем рады видеть Вас снова!</p>
            <img src="/track/farewell.png" alt="" className="min-h-0 flex-1 object-contain"
              onError={(e) => (e.currentTarget.style.display = "none")} />
            <Link href="/reviews" className="mt-2 self-start rounded-full px-5 py-2 font-sans text-sm" style={{ background: WINE, color: CREAM }}>
              Оставить отзыв
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <ConfirmBox token={token} status={order.status} />
            {order.status === "awaiting_payment" && (
              <p className="font-sans text-sm" style={{ color: WINE }}>Подтвердите заказ в Telegram, и мы начнём его собирать.</p>
            )}
            {order.status === "awaiting_quote" && (
              <p className="font-sans text-sm" style={{ color: WINE }}>Считаем стоимость упаковки и напишем вам в Telegram.</p>
            )}
            <p className="text-lg">
              Привезём до: <span className="font-semibold">{when(order.deliver_by)}</span>
              {order.delivery_type === "express" && <span className="font-sans text-sm"> · экспресс</span>}
            </p>
            <ul className="font-sans text-sm">
              {order.items.map((it, i) => (
                <li key={i}>{it.name}{it.quantity > 1 ? ` × ${it.quantity}` : ""}</li>
              ))}
            </ul>
            <p className="font-sans text-sm">Итого: <span className="font-semibold">{rub(order.total_cents)}</span></p>
          </div>
        )}
      </div>
    </div>
  );
}
