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

export type Cart = { items: CartItem[] };

const KEY = "kiv-cart";
const EMPTY: Cart = { items: [] };

let cache: Cart | null = null;            // in-memory copy, so we don't re-parse on every render
const listeners = new Set<() => void>();  // components waiting to hear about changes

function read(): Cart {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? EMPTY;
  } catch {
    cache = EMPTY; // storage blocked or corrupted: start empty rather than crash
  }
  return cache as Cart;
}

function write(c: Cart) {
  cache = c;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
  listeners.forEach((notify) => notify()); // tell every component to re-render
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// useSyncExternalStore: React's way to read outside data (here: localStorage) safely.
// The third argument is what the server renders, since it has no localStorage: an empty cart.
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

export function removeItem(id: number) {
  const c = read();
  write({ ...c, items: c.items.filter((i) => i.id !== id) });
}
