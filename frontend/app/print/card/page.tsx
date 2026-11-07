"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setPrintItem } from "@/lib/cart";
import { uploadImage } from "@/lib/upload";
import { useV } from "@/lib/address";

type PrintProduct = { id: number; name: string; price_cents: number; print_kind: string; print_size: string };
type Pic = { id: string; url: string };

const WINE = "#57030d";
const CREAM = "#f4ead6";
const SIZES: Record<string, string> = { A6: "10×15 см", A5: "15×21 см", A4: "21×30 см" };
const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;
const input = "w-full rounded-md border border-black/20 bg-white p-3 font-sans text-[15px] outline-none focus:border-[#57030d]";
const chosen = (on: boolean) => (on ? { background: WINE, color: CREAM, borderColor: WINE } : { borderColor: "rgba(0,0,0,0.2)" });

export function PicButton({ label, busy, onFile }: { label: string; busy: boolean; onFile: (f: File) => void }) {
  return (
    <label className="block cursor-pointer rounded-md border border-dashed border-[#57030d] px-3 py-2 text-center font-sans text-sm text-[#57030d]">
      {busy ? "Загружаем…" : label}
      <input type="file" accept="image/*" className="hidden" disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </label>
  );
}

export default function CardEditor() {
  const router = useRouter();
  const [products, setProducts] = useState<PrintProduct[]>([]);
  const [size, setSize] = useState("A5");
  const [side, setSide] = useState<"out" | "in">("out");
  const [front, setFront] = useState<Pic | null>(null);
  const [inner, setInner] = useState<Pic | null>(null);
  const [caption, setCaption] = useState("");
  const [body, setBody] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const v = useV();

  useEffect(() => {
    fetch("/api/prints").then((r) => r.json()).then(setProducts).catch(() => {});
  }, []);

  const cards = products.filter((p) => p.print_kind === "card");
  const product = cards.find((p) => p.print_size === size);

  async function pick(which: "front" | "inner", file: File) {
    setBusy(which);
    setError("");
    try {
      const id = await uploadImage(file);
      const pic = { id, url: URL.createObjectURL(file) };
      if (which === "front") setFront(pic);
      else setInner(pic);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось загрузить картинку");
    } finally {
      setBusy("");
    }
  }

  function add() {
    if (!product || !front) return;
    setPrintItem({
      id: product.id, name: product.name, category: "stationery", price_cents: product.price_cents, slots: 1,
      print: { image: front.id, image2: inner?.id, caption: caption.trim(), body: body.trim() },
    });
    router.back();
  }

  const panel = "relative flex-1 overflow-hidden bg-white shadow-md";

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden rounded-xl bg-[#e9e2d3] p-3 text-black">
      <h1 className="shrink-0 text-2xl" style={{ color: WINE }}>Своя открытка</h1>

      {/* the preview: the sheet opened flat, outside or inside */}
      <div className="flex shrink-0 justify-center">
        <div className="flex aspect-[1.414/1] w-full max-w-sm gap-[2px]">
          {side === "out" ? (
            <>
              <div className={`${panel} flex flex-col items-center justify-end pb-[12%]`}>
                <img src="/logo.png" alt="" className="w-[30%] opacity-80" />
                <span className="mt-1 font-sans text-[8px] opacity-60">literalwine.ru</span>
              </div>
              <div className={`${panel} flex flex-col p-[5%]`}>
                <div className="min-h-0 flex-1 bg-[#ddd] bg-cover bg-center" style={front ? { backgroundImage: `url(${front.url})` } : undefined}>
                  {!front && <span className="flex h-full items-center justify-center font-sans text-[10px] opacity-50">картинка</span>}
                </div>
                {caption && <p className="pt-[4%] text-center text-[11px] leading-tight">{caption}</p>}
              </div>
            </>
          ) : (
            <>
              <div className={`${panel} p-[5%]`}>
                {inner ? (
                  <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${inner.url})` }} />
                ) : (
                  <span className="flex h-full items-center justify-center font-sans text-[10px] opacity-40">картинка по желанию</span>
                )}
              </div>
              <div className={`${panel} flex items-center justify-center p-[8%]`}>
                <p className="whitespace-pre-line text-center text-[10px] italic leading-snug">{body || v("Ваш текст", "Твой текст")}</p>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 font-sans text-sm">
        {(["out", "in"] as const).map((s) => (
          <button key={s} onClick={() => setSide(s)} className="rounded-md border px-3 py-1.5" style={chosen(side === s)}>
            {s === "out" ? "Снаружи" : "Внутри"}
          </button>
        ))}
      </div>

      {/* the controls scroll, the preview stays */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <div className="grid grid-cols-3 gap-2 font-sans text-xs">
          {cards.map((p) => (
            <button key={p.id} onClick={() => setSize(p.print_size)} className="rounded-md border px-2 py-2" style={chosen(size === p.print_size)}>
              <span className="block font-semibold">{p.print_size}</span>
              <span className="block opacity-80">{SIZES[p.print_size]}</span>
              <span className="block">{rub(p.price_cents)}</span>
            </button>
          ))}
        </div>
        {side === "out" ? (
          <>
            <PicButton label={front ? "Заменить картинку" : "Загрузить картинку для лицевой стороны"} busy={busy === "front"} onFile={(f) => pick("front", f)} />
            <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={80} placeholder="Подпись под картинкой (необязательно)" className={input} />
          </>
        ) : (
          <>
            <PicButton label={inner ? "Заменить картинку" : "Картинка слева (необязательно)"} busy={busy === "inner"} onFile={(f) => pick("inner", f)} />
            {inner && <button onClick={() => setInner(null)} className="font-sans text-xs underline opacity-60">Убрать картинку</button>}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} rows={5} placeholder={v("Ваш текст", "Твой текст")} className={input} />
            <p className="text-right font-sans text-xs opacity-60">{body.length}/600</p>
          </>
        )}
        <label className="flex items-start gap-2 font-sans text-xs">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#57030d]" />
          <span>
            Изображения принадлежат мне или я вправе их использовать. Открытка делается по моему макету и{" "}
            <a href="/legal/delivery" target="_blank" className="underline">не подлежит возврату</a>.
          </span>
        </label>
        {error && (
          <p className="font-sans text-sm" style={{ color: WINE }}>
            {error}
            {error.includes("Войдите") && <> · <Link href="/account" className="underline">Войти</Link></>}
          </p>
        )}
      </div>

      <button onClick={add} disabled={!product || !front || !rights || !!busy}
        className="shrink-0 rounded-full py-3 font-sans shadow-md disabled:opacity-40" style={{ background: WINE, color: CREAM }}>
        {product ? `Добавить в заказ · ${rub(product.price_cents)}` : "Добавить в заказ"}
      </button>
    </div>
  );
}
