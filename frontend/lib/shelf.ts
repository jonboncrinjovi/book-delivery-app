// The shelf in the browser. For logged-in readers every change is also sent to the server
// (ignored if they're a guest); the shelf page moves leftover browser items to the server after login.
import { useSyncExternalStore } from "react";

export type ShelfItem = {
  id: number;
  name?: string;        // unknown while it's a parcel
  cover?: string;
  price_cents?: number;
  hidden: boolean;
  at: string;
};

const KEY = "kiv-shelf";
const EMPTY: ShelfItem[] = [];
let cache: ShelfItem[] | null = null;
const listeners = new Set<() => void>();

export function readShelf(): ShelfItem[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    cache = EMPTY;
  }
  return cache as ShelfItem[];
}

function write(items: ShelfItem[]) {
  cache = items;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useShelf(): ShelfItem[] {
  return useSyncExternalStore(subscribe, readShelf, () => EMPTY);
}

export function addToShelf(item: Omit<ShelfItem, "at">) {
  write([{ ...item, at: new Date().toISOString() }, ...readShelf().filter((i) => i.id !== item.id)]);
  // fire and forget: for guests the server answers 401 and nothing happens
  fetch("/api/me/shelf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: item.id, hidden: item.hidden }),
  }).catch(() => {});
}

export function removeFromShelf(id: number) {
  write(readShelf().filter((i) => i.id !== id));
  fetch(`/api/me/shelf/${id}`, { method: "DELETE" }).catch(() => {});
}

// after moving everything to the server
export function clearShelf() {
  write([]);
}
