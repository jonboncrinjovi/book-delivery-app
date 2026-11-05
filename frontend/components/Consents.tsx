"use client";

// two separate, unticked boxes: the offer, and the consent to personal data, which by law is given apart from other documents
export function Consents({ offer, setOffer, pd, setPd }: {
  offer: boolean; setOffer: (v: boolean) => void; pd: boolean; setPd: (v: boolean) => void;
}) {
  const link = "underline underline-offset-2";
  return (
    <div className="shrink-0 space-y-2 font-sans text-xs">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={offer} onChange={(e) => setOffer(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7a1f2b]" />
        <span>Принимаю условия <a href="/legal/offer" target="_blank" className={link}>публичной оферты</a></span>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={pd} onChange={(e) => setPd(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7a1f2b]" />
        <span>
          Даю <a href="/legal/consent" target="_blank" className={link}>согласие на обработку персональных данных</a> в соответствии с{" "}
          <a href="/legal/privacy" target="_blank" className={link}>политикой</a>
        </span>
      </label>
    </div>
  );
}
