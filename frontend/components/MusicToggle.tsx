"use client";

import { useEffect, useRef, useState } from "react";

export default function MusicToggle() {
  const audio = useRef<HTMLAudioElement>(null);
  const started = useRef(false); // has the random jump happened yet in this visit?
  const [playing, setPlaying] = useState(false);

  // jump to a random point the first time, then play.
  // The file's length is only known once its metadata has loaded.
  function start() {
    const a = audio.current;
    if (!a) return;
    a.volume = 1; // the file itself is mixed quiet, so every device sounds the same
    if (!started.current) {
      started.current = true;
      const seek = () => {
        if (Number.isFinite(a.duration)) a.currentTime = Math.random() * a.duration;
      };
      if (a.readyState >= 1) seek(); // metadata already there
      else a.addEventListener("loadedmetadata", seek, { once: true });
    }
    a.play().then(() => setPlaying(true)).catch(() => {});
  }

  // a visitor who turned music on last time: resume on their first touch anywhere
  useEffect(() => {
    let wanted = false;
    try {
      wanted = localStorage.getItem("music") === "on";
    } catch {}
    if (!wanted) return;
    document.addEventListener("pointerdown", start, { once: true });
    return () => document.removeEventListener("pointerdown", start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
    } else {
      start();
    }
    try {
      localStorage.setItem("music", playing ? "off" : "on");
    } catch {}
  }

  return (
    <>
      <audio ref={audio} src="/music/cafe-jazz.mp3" loop preload="none" />
      <button onClick={toggle} aria-label={playing ? "Выключить музыку" : "Включить музыку"}
        className="flex size-10 items-center justify-center rounded-full border border-line">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9h4l5-4v14l-5-4H4z" />
          {playing ? (
            <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
          ) : (
            <path d="M17 9l5 6M22 9l-5 6" />
          )}
        </svg>
      </button>
    </>
  );
}
