"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setPrintItem } from "@/lib/cart";
import { uploadImage } from "@/lib/upload";
import { PicButton } from "../card/page";

type PrintProduct = { id: number; name: string; price_cents: number; print_kind: string; print_size: string };

const WINE = "#7a1f2b";
const CREAM = "#f4ead6";
const rub = (cents: number) => `${(cents / 100).toLocaleString("ru-RU")} ₽`;
const input = "w-full rounded-md border border-black/20 bg-white p-3 font-sans text-[15px] outline-none focus:border-[#7a1f2b]";

export default function WrapEditor() {
  const router = useRouter();
  const [product, setProduct] = useState<PrintProduct | null>(null);
  const [pic, setPic] = useState<{ id: string; url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/prints").then((r) => r.json())
      .then((all: PrintProduct[]) => setProduct(all.find((p) => p.print_kind === "wrap") ?? null)).catch(() => {});
  }, []);

  async function pick(file: File) {
    setBusy(true);
    setError("");
    try {
      setPic({ id: await uploadImage(file), url: URL.createObjectURL(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось загрузить картинку");
    } finally {
      setBusy(false);
    }
  }

  function add() {
    if (!product) return;
    setPrintItem({
      id: product.id, name: product.name, category: "stationery", price_cents: product.price_cents, slots: 1,
      print: { image: pic?.id ?? "", caption: caption.trim(), body: "" },
    });
    router.back();
  }

  // the same pattern as the print: a 3×5 grid, photos and the phrase alternating
  const cells = Array.from({ length: 15 }, (_, i) => {
    const r = Math.floor(i / 3), c = i % 3;
    return pic && (!caption || (r + c) % 2 === 0) ? "pic" : caption ? "text" : "empty";
  });

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden rounded-xl bg-[#e9e2d3] p-3 text-black">
      <h1 className="shrink-0 text-2xl" style={{ color: WINE }}>Своя упаковка для цветов</h1>

      <div className="flex min-h-0 flex-1 justify-center">
        <div className="grid aspect-[1/1.414] h-full max-h-full grid-cols-3 grid-rows-5 bg-white shadow-md">
          {cells.map((kind, i) => (
            <div key={i} className="flex items-center justify-center overflow-hidden">
              {kind === "pic" && pic && (
                <div className="aspect-square w-[72%] rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${pic.url})` }} />
              )}
              {kind === "text" && (
                <span className="-rotate-[15deg] px-1 text-center text-[9px] italic leading-tight" style={{ color: WINE }}>{caption}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 space-y-2">
        <PicButton label={pic ? "Заменить картинку" : "Загрузить картинку"} busy={busy} onFile={pick} />
        <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={80} placeholder="Имя или короткая фраза" className={input} />
        <label className="flex items-start gap-2 font-sans text-xs">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7a1f2b]" />
          <span>Изображение принадлежит мне или я вправе его использовать. Упаковка делается по моему макету и не подлежит возврату.</span>
        </label>
        {error && (
          <p className="font-sans text-sm" style={{ color: WINE }}>
            {error}
            {error.includes("Войдите") && <> · <Link href="/account" className="underline">Войти</Link></>}
          </p>
        )}
        <button onClick={add} disabled={!product || (!pic && !caption.trim()) || !rights || busy}
          className="w-full rounded-full py-3 font-sans shadow-md disabled:opacity-40" style={{ background: WINE, color: CREAM }}>
          {product ? `Добавить в заказ · ${rub(product.price_cents)}` : "Добавить в заказ"}
        </button>
      </div>
    </div>
  );
}
