import Link from "next/link";

// later these come from the database; hard-coded is fine to start
const slides = [
  {
    title: "Хочешь подарить подарок?",
    text: "Да, но сегодня же не день рождения. Тогда, может, просто сделать приятный сюрприз?",
    href: "/sommelier",
    cta: "К сомелье",
  },
  { title: "Доставка бесплатно", text: "При заказе от 3000 ₽ по городу.", href: "/catalog", cta: "В каталог" },
  { title: "Сегодня, если до 19:00", text: "А экспресс — за два часа.", href: "/sommelier", cta: "Подобрать" },
];

export default function Carousel() {
  return (
    // -mx-4/px-4: slides run to the screen edges; snap-x: each swipe lands on a whole slide
    <div className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
      {slides.map((s) => (
        // 85% width lets the next slide peek in, which hints that you can swipe
        <Link key={s.title} href={s.href} className="w-[85%] shrink-0 snap-center rounded-3xl bg-wine p-6 text-paper-2">
          <p className="text-2xl font-bold">{s.title}</p>
          <p className="mt-2 font-sans text-sm opacity-90">{s.text}</p>
          <span className="mt-4 inline-block rounded-full border border-current px-4 py-1 font-sans text-sm">{s.cta}</span>
        </Link>
      ))}
    </div>
  );
}
