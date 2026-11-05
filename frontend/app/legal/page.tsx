import Link from "next/link";
import { DOCS } from "@/lib/legal";
import { COMPANY } from "@/lib/company";

export const metadata = { title: "Документы — Книжки&Винишко" };

export default function LegalIndex() {
  return (
    <div className="min-h-full rounded-xl bg-[#f4ead6] p-5 text-black">
      <h1 className="text-3xl text-[#7a1f2b]">Документы</h1>
      <ul className="mt-4 space-y-3">
        {DOCS.map((d) => (
          <li key={d.slug}>
            <Link href={`/legal/${d.slug}`} className="text-lg text-[#7a1f2b] underline underline-offset-4">{d.title}</Link>
            <p className="font-sans text-xs opacity-60">{d.summary}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 font-sans text-xs opacity-60">
        {COMPANY.shortName} · ИНН {COMPANY.inn} · ОГРН {COMPANY.ogrn}
      </p>
    </div>
  );
}
