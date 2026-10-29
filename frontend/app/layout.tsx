import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PT_Serif, Inter } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import MusicToggle from "@/components/MusicToggle";
import BottomNav from "@/components/BottomNav";

const serif = PT_Serif({ weight: ["400", "700"], subsets: ["latin", "cyrillic"], variable: "--font-pt-serif" });
const sans = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Книжки и винишко",
  description: "Книги, вино без алкоголя, закуски и цветы с доставкой",
};

const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* h-dvh: exactly the visible screen height (dvh adapts when mobile browser bars appear and hide);
          overflow-hidden: the page itself can never scroll */}
      <body className="flex h-dvh flex-col overflow-hidden font-serif">
        <header className="mx-auto grid w-full max-w-md shrink-0 grid-cols-[2.5rem_1fr_2.5rem] items-center px-3 py-2 text-on-chrome">
          <MusicToggle />
          <Link href="/" className="flex items-center justify-center gap-2 text-2xl">
            <span>Книжки</span>
            <Image src="/logo.png" alt="" width={36} height={36} className="rounded-full" />
            <span>Винишко</span>
          </Link>
          <ThemeToggle />
        </header>

        {/* the card takes all the height between header and bar (flex-1).
            min-h-0 lets it shrink below its content's height; overflow-y-auto means a page that is
            too long for now scrolls INSIDE the card while the frame stays still */}
        <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-3 pb-3">
          <div className="card min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-3xl border border-line p-3 shadow-lg">
            {children}
          </div>
        </main>

        <BottomNav />
      </body>
    </html>
  );
}
