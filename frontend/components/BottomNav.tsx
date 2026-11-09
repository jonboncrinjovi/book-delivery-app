"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// your icons in public/nav; the active one full, the others softened
const left = [
  { href: "/", label: "Главная", icon: "/nav/home.png" },
  { href: "/shelf", label: "Мои книги", icon: "/nav/shelf.png" },
];
const right = [
  { href: "/reviews", label: "Рецензии", icon: "/nav/reviews.png" },
  { href: "/cart", label: "Корзина", icon: "/nav/cart.png" },
];

export default function BottomNav() {
  const path = usePathname();

  const tab = (t: { href: string; label: string; icon: string }) => {
    const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
    return (
      <li key={t.href}>
        <Link href={t.href} aria-label={t.label}
          className={`flex p-3 transition ${active ? "opacity-100 scale-110" : "opacity-85 hover:opacity-100"}`}>
          <span aria-hidden className="block size-8 bg-current" style={{ WebkitMaskImage: `url(${t.icon})`, maskImage: `url(${t.icon})`, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }} />
        </Link>
      </li>
    );
  };

  return (
    <nav className="relative z-50 shrink-0 bg-chrome text-on-chrome shadow-[0_-4px_16px_rgba(0,0,0,.2)]">
      <ul className="mx-auto flex max-w-md items-end justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {left.map(tab)}
        {/* the butler: raised above the bar */}
        <li className="-mt-8">
          <Link href="/sommelier" aria-label="Сомелье"
            className="relative block size-16 overflow-hidden rounded-full bg-[#e7d2af] shadow-lg ring-4 ring-chrome">
            <Image src="/nav/butler-icon.png" alt="" fill sizes="64px" className="object-contain p-1" />
          </Link>
        </li>
        {right.map(tab)}
      </ul>
    </nav>
  );
}
