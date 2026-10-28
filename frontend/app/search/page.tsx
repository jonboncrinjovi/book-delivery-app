import Link from "next/link";
import AddToCart from "@/components/AddToCart";

type Hit = {
  id: number; category: string; name: string; author: string | null;
  price_cents: number; slots: number; image: string | null;
};

const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;

// search results must be fresh on every request, never cached from a build
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;

  // runs on the server: talk to Go directly, inside Docker's network
  let hits: Hit[] = [];
  if (q.trim().length >= 2) {
    const res = await fetch(`${process.env.API_URL ?? "http://localhost:8080"}/api/search?q=${encodeURIComponent(q)}`,
      { cache: "no-store" });
    if (res.ok) hits = await res.json();
  }

  return (
    <div className="pt-4">
      <h1 className="text-3xl font-bold">Поиск</h1>
      <form action="/search" className="mt-4">
        <input name="q" type="search" defaultValue={q} placeholder="Название, автор, «цветы»…" autoFocus
          className="w-full rounded-full border border-line bg-paper-2 px-5 py-3 font-sans outline-none focus:border-wine" />
      </form>

      {q.trim().length >= 2 && hits.length === 0 && (
        <div className="mt-8 text-center">
          <p className="font-sans text-muted">Ничего не нашлось.</p>
          <Link href="/" className="mt-4 inline-block rounded-full bg-wine px-6 py-3 font-sans text-paper-2">
            Довериться сомелье
          </Link>
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {hits.map((h) => (
          <li key={h.id} className="flex items-center gap-3 rounded-2xl border border-line bg-paper-2 p-3">
            {h.image
              ? <img src={h.image} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover" />
              : <div className="h-20 w-14 shrink-0 rounded-lg bg-line" />}
            <div className="flex-1">
              <p>{h.name}</p>
              {h.author && <p className="font-sans text-xs text-muted">{h.author}</p>}
              <p className="mt-1 font-sans text-sm">{rub(h.price_cents)}</p>
            </div>
            <AddToCart item={{ id: h.id, name: h.name, category: h.category, price_cents: h.price_cents, slots: h.slots }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
