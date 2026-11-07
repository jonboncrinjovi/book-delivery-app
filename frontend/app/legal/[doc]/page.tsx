import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS } from "@/lib/legal";
import { COMPANY } from "@/lib/company";

// all five pages are built ahead of time, at build
export function generateStaticParams() {
  return DOCS.map((d) => ({ doc: d.slug }));
}

export default async function LegalDoc({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = DOCS.find((x) => x.slug === doc);
  if (!d) notFound();

  return (
    <article className="min-h-full rounded-xl bg-[#f4ead6] p-5 font-sans text-sm leading-relaxed text-black">
      <Link href="/legal" className="text-xs opacity-60">← Документы</Link>
      <h1 className="mt-2 font-serif text-2xl leading-tight text-[#57030d]">{d.title}</h1>
      <p className="text-xs opacity-60">Редакция от {COMPANY.edition}</p>
      {d.sections.map((s) => (
        <section key={s.title} className="mt-5">
          <h2 className="font-serif text-lg text-[#57030d]">{s.title}</h2>
          {s.blocks.map((b, i) =>
            Array.isArray(b) ? (
              <ul key={i} className="mt-2 list-disc space-y-1 pl-5">
                {b.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : (
              <p key={i} className="mt-2">{b}</p>
            ),
          )}
        </section>
      ))}
    </article>
  );
}
