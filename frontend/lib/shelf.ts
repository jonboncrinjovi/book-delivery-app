// The reader's shelf: books they've kept with ♥. Stored in the browser for now;
// step 3 moves it to the server for logged-in users, so it follows them between devices.
import { useSyncExternalStore } from "react";

export type ShelfItem = {
  id: number;
  name?: string;    // unknown while it's still a blind parcel
  hidden: boolean;  // kept without opening: shown as a parcel
  at: string;       // when it was put on the shelf
};

const KEY = "kiv-shelf";
const EMPTY: ShelfItem[] = [];
let cache: ShelfItem[] | null = null;
const listeners = new Set<() => void>();

function read(): ShelfItem[] {
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
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

// putting a book back on the shelf replaces its old entry, e.g. once it's been opened
export function addToShelf(item: Omit<ShelfItem, "at">) {
  write([{ ...item, at: new Date().toISOString() }, ...read().filter((i) => i.id !== item.id)]);
}

export function removeFromShelf(id: number) {
  write(read().filter((i) => i.id !== id));
}
