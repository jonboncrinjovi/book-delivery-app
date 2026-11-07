"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setContact, useCart } from "@/lib/cart";
import { Consents } from "@/components/Consents";

const input = "w-full rounded-md border border-black/20 bg-white px-3 py-2.5 font-sans text-[15px] outline-none focus:border-[#57030d]";

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCart();
  const gift = cart.gift?.gift ?? false;
  const c = cart.contact;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rName, setRName] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [offerOk, setOfferOk] = useState(false);
  const [pdOk, setPdOk] = useState(false);

  // pre-fill: what's in the cart from last time, otherwise the account
  useEffect(() => {
    if (c) {
      setName(c.name); setPhone(c.phone); setRName(c.recipientName); setRPhone(c.recipientPhone);
      setAddress(c.address); setComment(c.comment);
      return;
    }
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m) return;
        setName((v) => v || m.name);
        setPhone((v) => v || m.phone || "");
        if (!gift) setAddress((v) => v || m.address || "");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cart.items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-xl">Корзина пуста</p>
        <Link href="/sommelier" className="rounded-full bg-wine px-6 py-3 font-sans text-paper-2">К сомелье</Link>
      </div>
    );
  }

  const ready = name.trim() && phone.trim() && address.trim() && (!gift || (rName.trim() && rPhone.trim())) && offerOk && pdOk;

  function next() {
    setContact({ name, phone, recipientName: rName, recipientPhone: rPhone, address, comment });
    router.push("/cart");
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl bg-[#f4ead6] p-4 text-black">
      <h1 className="shrink-0 text-3xl">Куда везём?</h1>

      {/* the form scrolls inside itself if a phone keyboard squeezes the screen */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        <p className="pt-1 font-sans text-xs uppercase tracking-wide opacity-60">{gift ? "Вы" : "Получатель"}</p>
        <input className={input} placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input} placeholder="Телефон" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />

        {gift && (
          <>
            <p className="pt-2 font-sans text-xs uppercase tracking-wide opacity-60">Кому подарок</p>
            <input className={input} placeholder="Имя получателя" value={rName} onChange={(e) => setRName(e.target.value)} />
            <input className={input} placeholder="Телефон получателя" type="tel" value={rPhone} onChange={(e) => setRPhone(e.target.value)} />
          </>
        )}

        <p className="pt-2 font-sans text-xs uppercase tracking-wide opacity-60">Адрес</p>
        <input className={input} placeholder="Улица, дом, квартира" value={address} onChange={(e) => setAddress(e.target.value)} />
        <input className={input} placeholder="Подъезд, этаж, домофон (необязательно)" value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>

      <Consents offer={offerOk} setOffer={setOfferOk} pd={pdOk} setPd={setPdOk} />
      <button onClick={next} disabled={!ready}
        className="shrink-0 rounded-full bg-[#57030d] px-6 py-3 font-sans text-[#f4ead6] shadow-md disabled:opacity-40">
        Дальше
      </button>
    </div>
  );
}
