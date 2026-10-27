// The cart lives in the browser's localStorage, so it survives reloads and page changes.
// Components read it through useCart(); any change re-renders every component using it.
import { useSyncExternalStore } from "react";

export type CartItem = {
  id: number;
  name: string;
  category: string;
  price_cents: number;
  slots: number;
  qty: number;
  hidden?: boolean; // a blind-date book: stays a surprise until delivery
};

export type GiftInfo = {
  gift: boolean;
  recipient?: string;     // code, e.g. "mom"
  recipientName?: string; // "Маме", for display
  occasion?: string;
  occasionName?: string;
};

export type CardChoice = {
  id?: number;   // design id; none = a plain card you sign by hand
  name?: string;
  price_cents: number;
  text: string;
};

export type Cart = {
  items: CartItem[];
  gift?: GiftInfo;
  card?: CardChoice;
  box: string;        // packaging code: "BAG" by default, or "S", "M", "L", "CUSTOM"
  bag: string | null; // bag colour code; null = "удиви меня"
};

const KEY = "kiv-cart";
const EMPTY: Cart = { items: [], box: "BAG", bag: null };

let cache: Cart | null = null;
const listeners = new Set<() => void>();

function read(): Cart {
  if (cache) return cache;
  try {
    // spread EMPTY first, so carts saved by older versions get the new fields' defaults
    cache = { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    cache = EMPTY;
  }
  return cache as Cart;
}

function write(c: Cart) {
  cache = c;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCart(): Cart {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function addItem(item: Omit<CartItem, "qty">) {
  const c = read();
  const found = c.items.some((i) => i.id === item.id);
  write({
    ...c,
    items: found
      ? c.items.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i))
      : [...c.items, { ...item, qty: 1 }],
  });
}

// qty 0 or less removes the item
export function setQty(id: number, qty: number) {
  const c = read();
  write({
    ...c,
    items: qty <= 0 ? c.items.filter((i) => i.id !== id) : c.items.map((i) => (i.id === id ? { ...i, qty } : i)),
  });
}

export function setGift(gift: GiftInfo) {
  write({ ...read(), gift });
}

export function setCard(card: CardChoice | undefined) {
  write({ ...read(), card });
}

export function setPackaging(box: string, bag: string | null) {
  write({ ...read(), box, bag: box === "BAG" ? bag : null });
}

export function clearCart() {
  write(EMPTY);
}
