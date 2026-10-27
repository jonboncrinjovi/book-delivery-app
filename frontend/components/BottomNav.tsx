"use client"; // needs the current address to highlight the active tab

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// a stroke icon from one or more SVG path strings; color comes from the text color
function Icon({ paths, size = 24 }: { paths: string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

type Tab = { href: string; label: string; icon: ReactNode; center?: boolean };

const tabs: Tab[] = [
  { href: "/", label: "Главная", icon: <Icon paths={["M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"]} /> },
  { href: "/catalog", label: "Каталог", icon: <Icon paths={["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"]} /> },
  // the centre button: a wine glass, raised above the bar
  { href: "/sommelier", label: "Сомелье", center: true, icon: <Icon size={30} paths={["M8 3h8l-1 6a3 3 0 0 1-6 0z", "M12 12v6", "M9 21h6"]} /> },
  { href: "/reviews", label: "Рецензии", icon: <Icon paths={["M4 5h16v11H8l-4 4z"]} /> },
  { href: "/cart", label: "Корзина", icon: <Icon paths={["M5 8h14l-1 13H6z", "M9 8V6a3 3 0 0 1 6 0v2"]} /> },
];

export default function BottomNav() {
  const path = usePathname(); // the current address, e.g. "/catalog"

  return (
    // fixed to the bottom; the env() padding keeps it above the iPhone home bar
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper-2/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-end justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((t) => {
          // "/" only counts as active on the home page itself, the others for their whole section
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
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
