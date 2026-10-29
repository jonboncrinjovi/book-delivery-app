import type { CSSProperties, ReactNode } from "react";

const PAPER = "#f4ead6"; // light kraft in both themes
const INK = "#000";

export type Shape = "round" | "wobble" | "box" | "burst";
export type Tail = "top-left" | "bottom-right" | "bottom-left" | "left" | "none";

// the jagged outline of the burst, as points around the box (x% y%)
const BURST =
  "polygon(50% 0%, 58% 14%, 74% 6%, 72% 22%, 92% 20%, 82% 35%, 100% 48%, 82% 58%, 94% 76%, 74% 74%, 76% 94%, 60% 84%, 50% 100%, 40% 84%, 24% 94%, 26% 74%, 6% 76%, 18% 58%, 0% 48%, 18% 35%, 8% 20%, 28% 22%, 26% 6%, 42% 14%)";

// a hand-inked bubble placed ON the picture.
// style: position and width; rotate: tilt in degrees; more: show ▸ for "tap for the next line"
export default function SpeechBubble({ children, shape = "round", tail = "none", style, rotate = 0, more = false }: {
  children: ReactNode;
  shape?: Shape;
  tail?: Tail;
  style?: CSSProperties;
  rotate?: number;
  more?: boolean;
}) {
  const text = "relative text-[15px] font-semibold leading-snug";
  const marker = more && <span className="absolute bottom-1 right-3 text-xs motion-safe:animate-pulse">▸</span>;

  return (
    // "rotate" is its own CSS property, so the swoop animation (which uses transform) doesn't erase the tilt
    <div className="absolute z-10 motion-safe:animate-swoop" style={{ ...style, rotate: `${rotate}deg`, color: INK }}>
      {shape === "burst" ? (
        // the burst: a black star with a slightly smaller kraft star on top, which leaves a black outline
        <div className="relative">
          <div className="absolute inset-0" style={{ background: INK, clipPath: BURST }} />
          <div className="absolute inset-[3px]" style={{ background: PAPER, clipPath: BURST }} />
          <div className={`${text} px-9 py-9 text-center`}>{children}</div>
          {marker}
        </div>
      ) : (
        <div
          className={`relative border-[2.5px] shadow-lg ${
            shape === "box" ? "rounded-md px-4 py-3" : shape === "wobble" ? "px-6 py-5" : "rounded-[1.4rem] px-4 py-3"
          }`}
          style={{
            background: PAPER,
            borderColor: INK,
            // the wobbly blob: eight different corner radii make an uneven, hand-drawn outline
            ...(shape === "wobble" ? { borderRadius: "58% 42% 52% 48% / 46% 56% 44% 54%" } : {}),
          }}>
          {shape !== "box" && (
            <svg className="absolute left-3 top-1.5" width="40" height="12" viewBox="0 0 40 12" aria-hidden="true">
              <path d="M2 10 Q7 3 18 2" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
              <path d="M22 2 L27 1" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          <div className={text}>{children}</div>
          {marker}
        </div>
      )}

      {/* tails: filled with the bubble colour and drawn over the border, so they join seamlessly */}
      {tail === "top-left" && (
        <svg className="absolute -top-[15px] left-6" width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <path d="M2 18 L8 2 L24 18" fill={PAPER} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      )}
      {tail === "bottom-right" && (
        <svg className="absolute -bottom-[15px] right-6" width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <path d="M2 0 L20 16 L24 0" fill={PAPER} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      )}
      {tail === "bottom-left" && (
        <svg className="absolute -bottom-[15px] left-6" width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
          <path d="M2 0 L6 16 L24 0" fill={PAPER} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      )}
      {tail === "left" && (
        <svg className="absolute -left-[15px] top-1/2 -translate-y-1/2" width="18" height="26" viewBox="0 0 18 26" aria-hidden="true">
          <path d="M18 2 L2 16 L18 24" fill={PAPER} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}
