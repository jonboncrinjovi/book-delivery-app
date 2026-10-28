"use client";

import { useEffect, useRef, useState } from "react";

export default function MusicToggle() {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  // a visitor who turned music on last time: resume on their first touch anywhere.
  // Browsers forbid sound before the visitor has interacted with the page.
  useEffect(() => {
    let wanted = false;
    try {
      wanted = localStorage.getItem("music") === "on";
    } catch {}
    if (!wanted) return;
    const start = () => {
      audio.current?.play().then(() => setPlaying(true)).catch(() => {});
    };
    document.addEventListener("pointerdown", start, { once: true }); // once: removes itself after firing
    return () => document.removeEventListener("pointerdown", start);
  }, []);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.volume = 0.35; // ignored on iPhones, hence the quieter file
      a.play().then(() => setPlaying(true)).catch(() => {});
    }
    try {
      localStorage.setItem("music", playing ? "off" : "on");
    } catch {}
  }

  return (
    <>
      {/* loop: start over at the end; preload="none": download only once play is pressed */}
      <audio ref={audio} src="/music/cafe-jazz.mp3" loop preload="none" />
      <button onClick={toggle} aria-label={playing ? "Выключить музыку" : "Включить музыку"}
        className="flex size-10 items-center justify-center rounded-full border border-line">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {/* the speaker */}
          <path d="M4 9h4l5-4v14l-5-4H4z" />
          {playing ? (
            // sound waves while playing
            <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
          ) : (
            // a cross while silent
            <path d="M17 9l5 6M22 9l-5 6" />
          )}
        </svg>
      </button>
    </>
  );
}
