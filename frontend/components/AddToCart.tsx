"use client"; // the only interactive part of the search page

import { useState } from "react";
import { addItem } from "@/lib/cart";

type Item = { id: number; name: string; category: string; price_cents: number; slots: number };

export default function AddToCart({ item }: { item: Item }) {
  const [added, setAdded] = useState(false);
  return (
    <button onClick={() => { addItem(item); setAdded(true); }}
      className={`shrink-0 rounded-full px-4 py-2 font-sans text-sm ${added ? "border border-wine text-wine" : "bg-wine text-paper-2"}`}>
      {added ? "В корзине" : "В корзину"}
    </button>
  );
}
