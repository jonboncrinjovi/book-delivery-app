import Link from "next/link";
import Carousel from "@/components/Carousel";

// codes match the API's categories; "cards" will open the card designs
const categories = [
  ["book", "Книги"], ["stationery", "Канцелярия"], ["drink", "Напитки"], ["snack", "Закуски"],
  ["flowers", "Цветы"], ["games", "Игры"], ["souvenirs", "Сувениры"], ["cards", "Открытки"],
] as const;

export default function Home() {
  return (
    <>
      {/* a plain HTML form: submitting goes to /catalog?q=..., no JavaScript needed */}
      <form action="/catalog" className="mt-2">
        <input name="q" type="search" placeholder="Книга, автор, настроение…"
          className="w-full rounded-full border border-line bg-paper-2 px-5 py-3 font-sans text-base outline-none focus:border-wine" />
      </form>

      <Carousel />

      <h2 className="mb-3 mt-8 text-2xl font-bold">Каталог</h2>
      <div className="grid grid-cols-2 gap-3">
        {categories.map(([code, name]) => (
          <Link key={code} href={`/catalog?category=${code}`}
            className="rounded-2xl border border-line bg-paper-2 px-4 py-6 text-center text-lg transition hover:border-wine">
            {name}
          </Link>
        ))}
      </div>
    </>
  );
}
