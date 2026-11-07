"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clearShelf, readShelf, removeFromShelf, useShelf } from "@/lib/shelf";

type Book = { id: number; name: string; author: string | null; cover: string | null; hidden: boolean; review: string | null };
type Parcel = { track: string; status: string; deliver_by: string; hidden: boolean };
type Library = { kept: Book[]; bought: Book[]; on_way: Parcel[] };
type Me = { name: string; username: string | null; photo: string | null };

const WINE = "#57030d";
const CREAM = "#f4ead6";

// a wooden plank: light top edge, darker front, a soft shadow on the wall below
function Plank() {
  return <div className="h-3 w-full shrink-0 rounded-sm bg-gradient-to-b from-[#f3e6cc] to-[#c9ad83] shadow-[0_6px_8px_rgba(0,0,0,0.3)]" />;
}

// one shelf: its name, the books standing on it (scrolling sideways if there are many), the plank
function Shelf({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <p className="shrink-0 font-sans text-[11px] uppercase tracking-wide opacity-60">{title}</p>
      <div className="flex min-h-0 flex-1 items-end gap-2 overflow-x-auto px-2 pt-1">
        {count === 0 ? <p className="pb-1 font-sans text-xs opacity-40">Пока пусто</p> : children}
      </div>
      <Plank />
    </section>
  );
}

// a book standing on a shelf: its cover, the parcel if it's blind, or its first letter on kraft
function Spine({ book, children }: { book: Book; children?: React.ReactNode }) {
  return (
    <div className="relative aspect-[2/3] h-full max-h-24 shrink-0">
      {book.hidden ? (
        <img src="/wrap/parcel.png" alt="Книга-сюрприз" className="h-full w-full object-contain" />
      ) : book.cover ? (
        <img src={book.cover} alt={book.name} className="h-full w-full rounded-sm object-cover shadow-md" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-sm bg-[#c9a77a] text-xl shadow-md">{book.name.charAt(0)}</div>
      )}
      {children}
    </div>
  );
}

const Grapes = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill={CREAM}>
    <circle cx="8" cy="9" r="3" /><circle cx="14" cy="9" r="3" /><circle cx="11" cy="14" r="3" /><circle cx="11" cy="19.5" r="2.5" />
    <path d="M11 6V2" stroke={CREAM} strokeWidth="1.5" />
  </svg>
);

export default function ShelfPage() {
  const local = useShelf(); // the browser shelf, which is all a guest has
  const [me, setMe] = useState<Me | null>(null);
  const [guest, setGuest] = useState(false);
  const [lib, setLib] = useState<Library | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/me");
      if (!r.ok) {
        setGuest(true);
        return;
      }
      setMe(await r.json());
      // books kept before logging in move to the server, then the browser copy is cleared
      const leftovers = readShelf();
      if (leftovers.length) {
        await Promise.all(leftovers.map((i) =>
          fetch("/api/me/shelf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_id: i.id, hidden: i.hidden }),
          }).catch(() => {})));
        clearShelf();
      }
      const l = await fetch("/api/me/library");
      if (l.ok) setLib(await l.json());
    })();
  }, []);

  function remove(id: number) {
    removeFromShelf(id); // also deletes it on the server
    setLib((l) => (l ? { ...l, kept: l.kept.filter((b) => b.id !== id) } : l));
  }

  const kept: Book[] = guest
    ? local.map((i) => ({ id: i.id, name: i.name ?? "", author: null, cover: i.cover ?? null, hidden: i.hidden, review: null }))
    : lib?.kept ?? [];
  const toReview = lib?.bought.filter((b) => !b.review) ?? [];
  const reviewed = lib?.bought.filter((b) => b.review) ?? [];
  const onWay = lib?.on_way ?? [];

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden rounded-xl bg-[#d9cdb8] p-4 text-black">
      {/* who's here: photo and name (leads to the profile settings), or the way in */}
      <div className="flex shrink-0 items-center gap-3">
        {me ? (
          <Link href="/account" className="flex items-center gap-3">
            {me.photo ? (
              <img src={me.photo} alt="" className="h-12 w-12 rounded-full object-cover shadow-md" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full text-xl" style={{ background: WINE, color: CREAM }}>
                {me.name.charAt(0)}
              </div>
            )}
            <div>
              <p className="text-xl leading-tight">{me.name}</p>
              {me.username && <p className="font-sans text-xs opacity-60">@{me.username}</p>}
            </div>
          </Link>
        ) : guest ? (
          <div className="flex items-center gap-3">
            <Link href="/account" className="rounded-full px-4 py-2 font-sans text-sm" style={{ background: WINE, color: CREAM }}>
              Войти через Telegram
            </Link>
            <p className="font-sans text-xs opacity-60">чтобы полка не потерялась</p>
          </div>
        ) : (
          <div className="h-12" />
        )}
      </div>

      <Shelf title="Ждут своего часа" count={kept.length}>
        {kept.map((b) => (
          <Spine key={b.id} book={b}>
            <Link href={`/sommelier/next?book=${b.id}`} className="absolute inset-0" aria-label="Заказать" />
            <button onClick={() => remove(b.id)} aria-label="Убрать с полки"
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 font-sans text-xs text-white">
              ×
            </button>
          </Spine>
        ))}
      </Shelf>

      {!guest && (
        <>
          <Shelf title="Ждут рецензии" count={toReview.length}>
            {toReview.map((b) => (
              <Link key={b.id} href={`/book/${b.id}?write=1`} className="h-full max-h-24">
                <Spine book={b}>
                  {/* the wine bookmark */}
                  <div className="absolute -top-1 right-2 h-8 w-3 [clip-path:polygon(0_0,100%_0,100%_100%,50%_80%,0_100%)]"
                    style={{ background: WINE }} />
                </Spine>
              </Link>
            ))}
          </Shelf>

          <Shelf title="С рецензией" count={reviewed.length}>
            {reviewed.map((b) => (
              <Spine key={b.id} book={b}>
                {b.review === "published" ? (
                  <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full shadow" style={{ background: WINE }}>
                    <Grapes />
                  </div>
                ) : (
                  <div className="absolute inset-x-0 bottom-1 mx-1 rounded-sm bg-black/60 text-center font-sans text-[9px] text-white">
                    {b.review === "pending" ? "на проверке" : "отклонена"}
                  </div>
                )}
              </Spine>
            ))}
          </Shelf>

          <Shelf title="В пути" count={onWay.length}>
            {onWay.map((p) => (
              <Link key={p.track} href={`/order/${p.track}`} className="aspect-square h-full max-h-24 shrink-0">
                <img src={p.hidden ? "/wrap/parcel.png" : "/wrap/parcel-open.png"} alt="Заказ в пути" className="h-full w-full object-contain" />
              </Link>
            ))}
          </Shelf>
        </>
      )}
    </div>
  );
}
