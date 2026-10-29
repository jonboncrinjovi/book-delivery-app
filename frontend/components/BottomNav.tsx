"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// a stroke icon from SVG path strings; colour comes from the text colour
function Icon({ paths }: { paths: string[] }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

// a circle as an SVG path: start left of the centre, two half-arcs around
const dot = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const left = [
  { href: "/", label: "Главная", paths: ["M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"] },
  // the book: the customer's deliveries (and profile, for now)
  { href: "/account", label: "Мои доставки", paths: ["M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z", "M4 21V5", "M8 7h7"] },
];
const right = [
  // a speech bubble holding a small bunch of grapes
  { href: "/reviews", label: "Рецензии", paths: ["M4 4h16v12H9l-5 4z", dot(10, 8.5, 1.3), dot(14, 8.5, 1.3), dot(12, 11.8, 1.3)] },
  { href: "/cart", label: "Корзина", paths: ["M3 4h2l2.5 11h11L21 7H6.5", dot(9.5, 19, 1.5), dot(16.5, 19, 1.5)] },
];

export default function BottomNav() {
  const path = usePathname();

  const tab = (t: { href: string; label: string; paths: string[] }) => {
    const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
    return (
      <li key={t.href}>
        <Link href={t.href} aria-label={t.label}
          className={`flex p-3 transition ${active ? "opacity-100" : "opacity-55 hover:opacity-80"}`}>
          <Icon paths={t.paths} />
        </Link>
      </li>
    );
  };

  return (
    <nav className="relative z-50 shrink-0 bg-chrome text-on-chrome shadow-[0_-4px_16px_rgba(0,0,0,.2)]">
      <ul className="mx-auto flex max-w-md items-end justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {left.map(tab)}
        {/* the butler: his face, raised above the bar */}
        <li className="-mt-8">
          <Link href="/sommelier" aria-label="Сомелье"
            className="relative block size-16 overflow-hidden rounded-full bg-on-chrome shadow-lg ring-4 ring-chrome">
            {/* stand-in: the face cropped live from the big picture.
                When you export a separate head image, replace with
                <Image src="/butler-head.png" alt="" fill sizes="64px" className="object-cover" /> */}
            <Image src="/butler.png" alt="" fill sizes="64px" className="object-cover"
              style={{ objectPosition: "50% 22%", transform: "scale(2.6)", transformOrigin: "50% 24%" }} />
          </Link>
        </li>
        {right.map(tab)}
      </ul>
    </nav>
  );
}
