"use client";
// «Вы» or «ты»: the person's choice, kept in a cookie for a year so server-built pages see it too.
import { useSyncExternalStore } from "react";

export type AddressForm = "vy" | "ty";

const listeners = new Set<() => void>();

function read(): AddressForm | null {
  const m = document.cookie.match(/(?:^|; )address=(vy|ty)/);
  return m ? (m[1] as AddressForm) : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAddress(form: AddressForm) {
  document.cookie = `address=${form}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((notify) => notify());
}

// null until the person has chosen (the butler asks then)
export function useAddressChoice(): AddressForm | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

// v("Войдите", "Войди") picks the right form; «вы» until a choice is made
export function useV() {
  const form = useAddressChoice();
  return (vy: string, ty: string) => (form === "ty" ? ty : vy);
}
