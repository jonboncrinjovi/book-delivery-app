"use client";

import { useRouter } from "next/navigation";
import { setGift } from "@/lib/cart";

// the first screen behind the big button: for yourself, or as a gift
export default function SommelierStart() {
  const router = useRouter();

  function choose(gift: boolean) {
    setGift({ gift }); // remembered in the cart: gifts get the card question later
    router.push("/sommelier/tags");
  }

  // the cards keep their own kraft and paper colours in both themes, like objects on the table
  const card =
    "relative flex min-h-0 flex-1 items-center rounded-lg border border-black/50 bg-no-repeat shadow-md transition active:scale-[0.98]";

  return (
    <div className="flex h-full flex-col gap-4">
      <h1 className="shrink-0 pt-2 text-center text-3xl">Итак, приступим!</h1>

      <button onClick={() => choose(false)} className={`${card} justify-end bg-[#d9b98c] pr-8`}
        style={{ backgroundImage: "url(/sommelier/self.png)", backgroundPosition: "8% center", backgroundSize: "auto 78%" }}>
        <span className="text-4xl leading-tight text-[#6b1f2b]">Для<br />себя</span>
      </button>

      <button onClick={() => choose(true)} className={`${card} justify-start bg-[#efe6d4] pl-8`}
        style={{ backgroundImage: "url(/sommelier/gift.png)", backgroundPosition: "92% center", backgroundSize: "auto 78%" }}>
        <span className="text-4xl leading-tight text-[#6b1f2b]">В<br />подарок</span>
      </button>
    </div>
  );
}
