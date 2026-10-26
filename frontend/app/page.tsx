// TypeScript: describe what a product from the API looks like,
// so the editor and compiler catch typos like p.prise
type Product = {
  id: number;
  category: string;
  name: string;
  author?: string;      // ? = may be missing
  price_cents: number;
};

// render on every request instead of once at build time, so the catalog is always fresh
export const dynamic = "force-dynamic";

// a Server Component: this function runs on the server, not in the browser.
// It fetches straight from Go and sends finished HTML to the visitor.
export default async function Home() {
  const res = await fetch(`${process.env.API_URL ?? "http://localhost:8080"}/api/products`);
  const products: Product[] = await res.json();

  return (
    <main className="p-8">
      <h1 className="mb-4 text-3xl">Книжки и винишко</h1>
      <ul>
        {/* key: React needs a stable id per list item to track changes efficiently */}
        {products.map((p) => (
          <li key={p.id}>
            {p.name} — {p.price_cents / 100} ₽
          </li>
        ))}
      </ul>
    </main>
  );
}
