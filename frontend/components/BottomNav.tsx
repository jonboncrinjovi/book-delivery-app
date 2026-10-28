"use client"; // needs the current address to highlight the active tab

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function Icon({ paths, size = 24 }: { paths: string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

type Tab = { href: string; label: string; icon: ReactNode; center?: boolean };

const tabs: Tab[] = [
  { href: "/search", label: "Поиск", icon: <Icon paths={["M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14z", "M20 20l-4-4"]} /> },
  // profile as a library card
  { href: "/account", label: "Профиль", icon: <Icon paths={[
    "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    "M6 9h4v5H6z", "M13 10h5", "M13 14h4",
  ]} /> },
  // the butler is the home page (placeholder icon until the real drawing)
  { href: "/", label: "Сомелье", center: true, icon: <Icon size={34} paths={[
    "M7 3.5a2 2 0 1 1 0 4a2 2 0 0 1 0-4z",
    "M4 21v-8a3 3 0 0 1 6 0v8",
    "M10 13h4",
    "M13 12h9",
    "M15.5 12V8.5l.5-1V6h1v1.5l.5 1V12",
    "M19.5 8h2l-.3 1.6a.7.7 0 0 1-1.4 0z",
    "M20.5 10.2V12",
  ]} /> },
  { href: "/reviews", label: "Рецензии", icon: <Icon paths={["M4 5h16v11H8l-4 4z"]} /> },
  { href: "/cart", label: "Корзина", icon: <Icon paths={["M5 8h14l-1 13H6z", "M9 8V6a3 3 0 0 1 6 0v2"]} /> },
];

export default function BottomNav() {
  const path = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper-2/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-end justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((t) => {
          if (t.center) {
            return (
              <li key={t.href} className="-mt-7">
                <Link href={t.href} aria-label={t.label}
                  className="flex size-16 items-center justify-center rounded-full bg-wine text-paper-2 shadow-lg ring-4 ring-paper-2">
                  {t.icon}
                </Link>
              </li>
            );
          }
          const active = path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link href={t.href}
                className={`flex flex-col items-center gap-1 px-2 py-2 font-sans text-xs ${active ? "text-wine" : "text-muted"}`}>
                {t.icon}
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
