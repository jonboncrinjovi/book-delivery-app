"use client";

import { useEffect, useRef } from "react";

export default function TelegramLogin({ bot }: { bot: string }) {
  const box = useRef<HTMLDivElement>(null); // a handle on the real <div> in the page

  useEffect(() => {
    if (!box.current || !bot) return;
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    // dataset.fooBar becomes the attribute data-foo-bar, which Telegram's script reads
    s.dataset.telegramLogin = bot;                                      // the bot's username, without @
    s.dataset.size = "large";
    s.dataset.authUrl = `${window.location.origin}/api/auth/telegram`; // where Telegram sends the user back
    s.dataset.requestAccess = "write";                                  // lets the bot message them later (order updates)
    box.current.replaceChildren(s);
  }, [bot]);

  return <div ref={box} className="flex justify-center" />;
}
