import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PT_Serif, Inter } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import BottomNav from "@/components/BottomNav";

// Next downloads these at build time and serves them itself; cyrillic subset for Russian
const serif = PT_Serif({ weight: ["400", "700"], subsets: ["latin", "cyrillic"], variable: "--font-pt-serif" });
const sans = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Книжки и винишко",
  description: "Книги, вино без алкоголя, закуски и цветы с доставкой",
};

// runs before the page paints: applies the saved theme, or the system one,
// so a dark-mode visitor never sees a flash of the light page
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the script changes <html> before React loads; that's intended
    <html lang="ru" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-serif">
        <header className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={44} height={44} className="rounded-full" />
            <span className="text-lg font-bold">Книжки и винишко</span>
          </Link>
                    <div className="flex items-center gap-2">
            <Link href="/account" aria-label="Аккаунт"
              className="flex size-10 items-center justify-center rounded-full border border-line">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            </Link>
            <ThemeToggle />
          </div>
        </header>
        {/* max-w-md: a phone-width column, centred on big screens; pb-28 leaves room for the bar */}
        <main className="mx-auto max-w-md px-4 pb-28">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
