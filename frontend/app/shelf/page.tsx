"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addItem } from "@/lib/cart";
import { clearShelf, readShelf, removeFromShelf, useShelf } from "@/lib/shelf";

type Book = {
  id: number; name: string | null; author: string | null; cover: string | null;
  hook: string; description: string; price_cents: number;
  hidden: boolean; blind: boolean; status: string; track: string;
};
type Me = { name: string; photo: string | null };

const PER_SHELF = 4;
const KEPT_SHELVES = 3;
const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;

const statusNames: Record<string, string> = {
  awaiting_quote: "ждёт расчёта", awaiting_payment: "ждёт оплаты", paid: "оплачен",
  packing: "собираем", on_the_way: "в пути", delivered: "доставлен",
};

// one book standing on a shelf: a cover, or a kraft parcel tied with twine
function OnShelf({ b, onOpen }: { b: Book; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="relative aspect-[2/3] h-[88%] shrink-0 shadow-[2px_2px_6px_rgba(0,0,0,.35)] transition active:scale-95">
      {b.hidden ? (
        <span className="absolute inset-0 bg-[#c9a77a]">
          <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-[#6e4f2a]" />
          <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-[#6e4f2a]" />
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-black/70">?</span>
        </span>
      ) : b.cover ? (
        <img src={b.cover} alt={b.name ?? ""} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center bg-[#6b1f2b] p-1 text-center text-[10px] leading-tight text-[#f4ead6]">{b.name}</span>
      )}
      {/* an order on its way: a status stamp */}
      {b.status && b.status !== "delivered" && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 -rotate-6 whitespace-nowrap rounded-sm bg-wine px-1 font-sans text-[9px] text-paper-2">
          {statusNames[b.status] ?? b.status}
        </span>
      )}
      {/* delivered after a blind date */}
      {b.blind && b.status === "delivered" && (
        <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center font-sans text-[9px] text-white">вслепую</span>
      )}
    </button>
  );
}

// a wooden plank with the books standing on it
function ShelfRow({ books, onOpen, label }: { books: Book[]; onOpen: (b: Book) => void; label?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-end">
      {label && <p className="font-sans text-[10px] uppercase tracking-wide text-muted">{label}</p>}
      <div className="flex min-h-0 flex-1 items-end justify-center gap-3 px-2">
        {books.map((b) => <OnShelf key={b.id} b={b} onOpen={() => onOpen(b)} />)}
      </div>
      <div className="h-2.5 rounded-sm bg-gradient-to-b from-[#d9b98c] to-[#a8835a] shadow-[0_5px_6px_rgba(0,0,0,.25)]" />
    </div>
  );
}

export default function ShelfPage() {
  const router = useRouter();
  const local = useShelf();
  const [me, setMe] = useState<Me | null>(null);
  const [guest, setGuest] = useState(false);
  const [server, setServer] = useState<{ kept: Book[]; orders: Book[] } | null>(null);
  const [page, setPage] = useState(0);   // which twelve kept books are showing
  const [oPage, setOPage] = useState(0); // which four orders are showing
  const [open, setOpen] = useState<Book | null>(null);

  async function load() {
    const res = await fetch("/api/me/shelf");
    if (res.ok) setServer(await res.json());
  }

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/me");
      if (!res.ok) {
        setGuest(true);
        return;
      }
      setMe(await res.json());
      // books kept before logging in: move them to the server, then forget the browser copy
      const leftovers = readShelf();
      await Promise.all(leftovers.map((i) =>
        fetch("/api/me/shelf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: i.id, hidden: i.hidden }),
        }).catch(() => {})));
      if (leftovers.length) clearShelf();
      load();
    })();
  }, []);

  // opening a book that isn't wrapped: fetch its description if we don't have it yet
  useEffect(() => {
    if (!open || open.hidden || open.description) return;
    fetch(`/api/sommelier/reveal/${open.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOpen((o) => (o && o.id === d.id ? { ...o, ...d } : o)))
      .catch(() => {});
  }, [open]);

  // guests: the browser's shelf, shaped like the server's
  const localBooks: Book[] = local.map((i) => ({
    id: i.id, name: i.hidden ? null : i.name ?? null, author: null, cover: i.hidden ? null : i.cover ?? null,
    hook: "", description: "", price_cents: i.price_cents ?? 0,
    hidden: i.hidden, blind: i.hidden, status: "", track: "",
  }));
  const kept = guest ? localBooks : server?.kept ?? [];
  const orders = guest ? [] : server?.orders ?? [];

  const perPage = PER_SHELF * KEPT_SHELVES;
  const pages = Math.max(1, Math.ceil(kept.length / perPage));
  const visible = kept.slice(page * perPage, (page + 1) * perPage);
  const oPages = Math.max(1, Math.ceil(orders.length / PER_SHELF));
  const visibleOrders = orders.slice(oPage * PER_SHELF, (oPage + 1) * PER_SHELF);

  function toCart(b: Book) {
    addItem({ id: b.id, category: "book", name: b.name ?? "Книга-сюрприз", price_cents: b.price_cents, slots: 2, hidden: b.hidden });
    router.push(`/sommelier/next?book=${b.id}`);
  }

  async function remove(b: Book) {
    removeFromShelf(b.id);
    setOpen(null);
    if (!guest) {
      await fetch(`/api/me/shelf/${b.id}`, { method: "DELETE" });
      load();
    }
  }

  const arrow = "font-sans text-xl text-muted disabled:opacity-20";

  return (
    <div className="relative flex h-full flex-col gap-2">
      {/* top: who you are (or log in), and paging */}
      <div className="flex shrink-0 items-center justify-between">
        <Link href="/account" className="flex items-center gap-2 font-sans text-sm">
          {me?.photo && <img src={me.photo} alt="" className="size-7 rounded-full" />}
          <span>{me ? me.name : "Войти"}</span>
        </Link>
        {pages > 1 && (
          <div className="flex items-center gap-3">
            <button className={arrow} disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
            <span className="font-sans text-xs text-muted">{page + 1}/{pages}</span>
            <button className={arrow} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
          </div>
        )}
      </div>

      {/* three shelves of kept books */}
      {Array.from({ length: KEPT_SHELVES }, (_, s) => (
        <ShelfRow key={s} books={visible.slice(s * PER_SHELF, (s + 1) * PER_SHELF)} onOpen={setOpen} />
      ))}

      {/* the bottom shelf: orders */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ShelfRow books={visibleOrders} onOpen={setOpen} label="Заказы" />
        {oPages > 1 && (
          <div className="absolute right-0 top-0 flex gap-3">
            <button className={arrow} disabled={oPage === 0} onClick={() => setOPage(oPage - 1)}>‹</button>
            <button className={arrow} disabled={oPage >= oPages - 1} onClick={() => setOPage(oPage + 1)}>›</button>
          </div>
        )}
      </div>

      {kept.length === 0 && orders.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="pointer-events-auto mx-6 rounded-2xl bg-paper-2/90 p-4 text-center">
            Полки пока пусты. <Link href="/sommelier" className="text-wine underline">Сомелье знает, чем их заполнить.</Link>
          </p>
        </div>
      )}
      {guest && kept.length > 0 && (
        <p className="shrink-0 text-center font-sans text-[11px] text-muted">
          <Link href="/account" className="underline">Войдите</Link>, чтобы полка была с вами на всех устройствах
        </p>
      )}

      {/* a book, opened: framed, on its own plank */}
      {open && (
        <div className="absolute inset-0 z-20 flex flex-col rounded-xl border-[3px] border-double border-black/50 bg-[#efe6d4] p-4 text-black">
          <button onClick={() => setOpen(null)} aria-label="Закрыть" className="absolute right-3 top-2 font-sans text-xl">×</button>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-end">
            <div className="flex min-h-0 flex-1 items-end">
              <OnShelf b={open} onOpen={() => {}} />
            </div>
            <div className="h-2.5 w-3/4 rounded-sm bg-gradient-to-b from-[#d9b98c] to-[#a8835a] shadow-[0_5px_6px_rgba(0,0,0,.25)]" />
          </div>

          <div className="mt-4 shrink-0 space-y-2 text-center">
            {open.hidden ? (
              <p>Это свидание вслепую. Вы узнаете её при получении.</p>
            ) : (
              <>
                <p className="text-xl font-bold">{open.name}</p>
                {open.author && <p className="font-sans text-sm opacity-60">{open.author}</p>}
                {(open.hook || open.description) && (
                  <p className="line-clamp-4 text-sm italic">{open.hook ? `«${open.hook}»` : open.description}</p>
                )}
              </>
            )}
            {open.blind && open.status === "delivered" && (
              <p className="font-sans text-xs opacity-60">Вы заказали её вслепую.</p>
            )}

            {/* what you can do depends on where the book is */}
            {!open.status && (
              <>
                <button onClick={() => toCart(open)}
                  className="w-full rounded-full bg-[#7a1f2b] px-6 py-3 font-sans text-[#f4ead6]">
                  Добавить в корзину · {rub(open.price_cents)}
                </button>
                <button onClick={() => remove(open)} className="font-sans text-xs opacity-60 underline">Убрать с полки</button>
              </>
            )}
            {open.status && open.status !== "delivered" && (
              <Link href={`/order/${open.track}`}
                className="block w-full rounded-full bg-[#7a1f2b] px-6 py-3 font-sans text-[#f4ead6]">
                Отследить заказ
              </Link>
            )}
            {open.status === "delivered" && (
              <Link href="/reviews" className="block w-full rounded-full bg-[#7a1f2b] px-6 py-3 font-sans text-[#f4ead6]">
                Оставить отзыв
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
