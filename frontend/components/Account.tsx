"use client";

import { useEffect, useState } from "react";
import TelegramLogin from "@/components/TelegramLogin";

type Tag = { id: number; name: string; children?: Tag[] };
type ReadBook = { id: number; name: string; author: string | null; source: string; confirmed: boolean };
type OrderSummary = { id: number; status: string; total_cents: number; created_at: string; deliver_by: string };
type Me = {
  id: number; name: string; username: string | null; photo: string | null; about: string;
  favorites: number[]; blocked: number[]; reads: ReadBook[]; orders: OrderSummary[];
};

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;
const day = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

const statusNames: Record<string, string> = {
  awaiting_quote: "ждёт расчёта", awaiting_payment: "ждёт оплаты", paid: "оплачен",
  packing: "собираем", on_the_way: "в пути", delivered: "доставлен", cancelled: "отменён",
};

export default function Account({ bot }: { bot: string }) {
  // three states: undefined = still loading, null = not logged in, Me = logged in
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [anchors, setAnchors] = useState<Tag[]>([]);
  const [about, setAbout] = useState("");
  const [fav, setFav] = useState<number[]>([]);
  const [blocked, setBlocked] = useState<number[]>([]);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    // the session cookie travels with this request automatically (same site)
    fetch("/api/me")
      .then(async (r) => {
        if (r.status === 401) {
          setMe(null);
          return;
        }
        const m: Me = await r.json();
        setMe(m);
        setAbout(m.about);
        setFav(m.favorites);
        setBlocked(m.blocked);
      })
      .catch(() => setMe(null));
    fetch("/api/tags").then((r) => r.json()).then(setAnchors).catch(() => {});
  }, []);

  if (me === undefined) return <p className="pt-10 text-center font-sans text-muted">Загрузка…</p>;

  if (me === null) {
    return (
      <div className="pt-10 text-center">
        <h1 className="text-3xl font-bold">Войти</h1>
        <p className="mx-auto mt-2 max-w-xs font-sans text-sm text-muted">
          Через Telegram, в одно касание. Сомелье запомнит, что ты любишь и что уже прочитано.
        </p>
        <div className="mt-6"><TelegramLogin bot={bot} /></div>
      </div>
    );
  }

  const user = me; // a constant copy, so the functions below know it's definitely logged in

  // a tag cycles on each tap: neutral → favourite → "не предлагать" → neutral
  function cycle(id: number) {
    if (fav.includes(id)) {
      setFav(fav.filter((x) => x !== id));
      setBlocked([...blocked, id]);
    } else if (blocked.includes(id)) {
      setBlocked(blocked.filter((x) => x !== id));
    } else {
      setFav([...fav, id]);
    }
    setSaved("");
  }

  async function save() {
    const r = await fetch("/api/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ about, favorites: fav, blocked }),
    });
    setSaved(r.ok ? "Сохранено" : "Не получилось сохранить");
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setMe(null);
  }

  async function unread(id: number) {
    await fetch(`/api/me/reads/${id}`, { method: "DELETE" });
    setMe({ ...user, reads: user.reads.filter((b) => b.id !== id) });
  }

  const chip = (t: Tag) => {
    const state = fav.includes(t.id) ? "fav" : blocked.includes(t.id) ? "blocked" : "";
    return (
      <button key={t.id} onClick={() => cycle(t.id)}
        className={`rounded-full border px-3 py-1 ${
          state === "fav" ? "border-wine bg-wine text-paper-2"
          : state === "blocked" ? "border-line text-muted line-through"
          : "border-line bg-paper-2"}`}>
        {t.name}
      </button>
    );
  };

  return (
    <div className="pt-4">
      <div className="flex items-center gap-4">
        {user.photo && <img src={user.photo} alt="" className="size-14 rounded-full" />}
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{user.name}</h1>
          {user.username && <p className="font-sans text-sm text-muted">@{user.username}</p>}
        </div>
        <button onClick={logout} className="font-sans text-sm text-muted underline">Выйти</button>
      </div>

      <h2 className="mt-8 text-xl font-bold">О себе</h2>
      <textarea value={about} maxLength={200} rows={3}
        onChange={(e) => { setAbout(e.target.value); setSaved(""); }}
        placeholder="Что читаешь, что любишь, что тебя трогает"
        className="mt-2 w-full rounded-2xl border border-line bg-paper-2 p-4 font-sans outline-none focus:border-wine" />
      <p className="text-right font-sans text-xs text-muted">{about.length}/200</p>

      <h2 className="mt-6 text-xl font-bold">Вкусы</h2>
      <p className="mt-1 font-sans text-sm text-muted">
        Одно касание: любимое. Второе: не предлагать. Третье: сбросить.
      </p>
      {anchors.map((a) => (
        <div key={a.id} className="mt-4">
          <div className="flex flex-wrap gap-2 font-sans text-sm">
            {[a, ...(a.children ?? [])].map(chip)}
          </div>
        </div>
      ))}

      <button onClick={save} className="mt-6 w-full rounded-full bg-wine px-6 py-3 font-sans text-paper-2">
        Сохранить
      </button>
      {saved && <p className="mt-2 text-center font-sans text-sm text-muted">{saved}</p>}

      <h2 className="mt-10 text-xl font-bold">Прочитано</h2>
      {user.reads.length === 0 ? (
        <p className="mt-2 font-sans text-sm text-muted">Пока пусто. Отмечай прочитанное у сомелье.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-paper-2">
          {user.reads.map((b) => (
            <li key={b.id} className="flex items-center gap-3 p-4">
              <div className="flex-1">
                <p>{b.name}</p>
                <p className="font-sans text-xs text-muted">
                  {b.author}{b.confirmed ? " · подтверждено" : ""}
                </p>
              </div>
              <button onClick={() => unread(b.id)} aria-label="Убрать" className="font-sans text-muted">✕</button>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-xl font-bold">Заказы</h2>
      {user.orders.length === 0 ? (
        <p className="mt-2 font-sans text-sm text-muted">Заказов пока нет.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-paper-2 font-sans text-sm">
          {user.orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between p-4">
              <span>№{o.id} от {day(o.created_at)}</span>
              <span className="text-muted">{statusNames[o.status] ?? o.status}</span>
              <span>{rub(o.total_cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
