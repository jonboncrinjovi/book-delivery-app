"use client"; // runs in the browser: it needs clicks and localStorage

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  // null until we're in the browser; the server can't know the visitor's theme
  const [theme, setTheme] = useState<string | null>(null);

  // after the first render, read the theme the head script already applied
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme ?? "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next; // switches every color at once via the CSS variables
    try {
      localStorage.setItem("theme", next); // remembered for the next visit
    } catch {}                             // private mode can block storage; the toggle still works
    setTheme(next);
  }

  return (
    <button onClick={toggle} aria-label="Сменить тему" className="flex size-10 items-center justify-center rounded-full">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        {theme === "dark" ? (
          // sun: offered while dark
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          // moon: offered while light
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}
