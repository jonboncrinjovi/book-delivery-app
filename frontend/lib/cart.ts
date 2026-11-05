// The cart lives in the browser's localStorage, so it survives reloads and page changes.
import { useSyncExternalStore } from "react";

export type CartItem = {
  id: number;
  name: string;
  category: string;
  price_cents: number;
  slots: number;
  qty: number;
  hidden?: boolean;
  print?: PrintSpec; // a card or wrapping printed to the customer's design
};

export type GiftInfo = {
  gift: boolean;
  recipient?: string;
  recipientName?: string;
  occasion?: string;
  occasionName?: string;
};

export type CardChoice = { id?: number; name?: string; price_cents: number; text: string };

export type Contact = {
  name: string;
  phone: string;
  recipientName: string;  // gifts only
  recipientPhone: string; // gifts only
  address: string;
  comment: string;        // entrance, floor, intercom: added to the address for the courier
};

export type Cart = {
  items: CartItem[];
  gift?: GiftInfo;
  card?: CardChoice;
  box: string;
  bag: string | null;
  contact?: Contact;
};

const KEY = "kiv-cart";
const EMPTY: Cart = { items: [], box: "BAG", bag: null };

let cache: Cart | null = null;
const listeners = new Set<() => void>();

function read(): Cart {
  if (cache) return cache;
  try {
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

export function setContact(contact: Contact) {
  write({ ...read(), contact });
}

// after a successful order: empty the cart, but keep the contacts for next time
export function clearCart() {
  write({ ...EMPTY, contact: read().contact });
}

export type PrintSpec = { image: string; image2?: string; caption: string; body: string };

// a printed item replaces an earlier design of the same product instead of adding a second copy
export function setPrintItem(item: Omit<CartItem, "qty">) {
  const c = read();
  write({ ...c, items: [...c.items.filter((i) => i.id !== item.id), { ...item, qty: 1 }] });
}
