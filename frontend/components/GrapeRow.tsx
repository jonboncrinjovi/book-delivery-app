// The grape level as a row of five berries: filled up to the level, outlined after it (0 = not rated yet)
export const GRAPE_NAMES = ["", "Лист", "Цветение", "Завязь", "Созревание", "Гроздь"];

export function GrapeRow({ level, size = 10 }: { level: number; size?: number }) {
  return (
    <span className="inline-flex gap-[3px]" title={GRAPE_NAMES[level] || "Ещё не оценено"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="rounded-full"
          style={{ width: size, height: size, background: i <= level ? "#7a1f2b" : "transparent", border: "1.5px solid #7a1f2b" }} />
      ))}
    </span>
  );
}
