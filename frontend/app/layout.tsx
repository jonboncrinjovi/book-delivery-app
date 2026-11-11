import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/pt-serif/400.css";
import "@fontsource/pt-serif/700.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/caveat";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import MusicToggle from "@/components/MusicToggle";
import BottomNav from "@/components/BottomNav";


export const metadata: Metadata = {
  title: "Книжки&Винишко",
  description: "Книги, вино без алкоголя, закуски и цветы с доставкой",
};

const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* h-dvh: exactly the visible screen height (dvh adapts when mobile browser bars appear and hide);
          overflow-hidden: the page itself can never scroll */}
      <body className="flex h-dvh flex-col overflow-hidden font-serif">
        <header className="relative z-40 shrink-0 bg-chrome text-on-chrome shadow-[0_4px_16px_rgba(0,0,0,.2)]">
          <div className="mx-auto grid w-full max-w-md grid-cols-[2.5rem_1fr_2.5rem] items-center px-3 py-2">
          <MusicToggle />
          <Link href="/" className="flex items-center justify-center gap-2 text-2xl">
            <img src="/brand/logo-wine.png" alt="Книжки&Винишко" className="logo-light h-11 w-auto translate-x-2" />
            <img src="/brand/logo-kraft.png" alt="Книжки&Винишко" className="logo-dark h-11 w-auto translate-x-2" />
          </Link>
          <ThemeToggle />
          </div>
        </header>

        {/* the card takes all the height between header and bar (flex-1).
            min-h-0 lets it shrink below its content's height; overflow-y-auto means a page that is
            too long for now scrolls INSIDE the card while the frame stays still */}
        <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-3 pb-3 pt-3">
          <div className="card min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-3xl border border-line p-3 shadow-lg">
            {children}
          </div>
        </main>

        <p className="mx-auto flex w-full max-w-md shrink-0 justify-between px-6 pb-1 font-sans text-[10px] text-on-chrome opacity-70"><Link href="/legal">Документы и реквизиты</Link><a href="https://t.me/literalwine" target="_blank" rel="noopener noreferrer">Наш Telegram</a></p>
        <BottomNav />
      </body>
    </html>
  );
}
