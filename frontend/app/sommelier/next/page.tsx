import Wizard from "@/components/Wizard";

// searchParams: the ?book=12 part of the address; in Next.js 15+ it arrives as a Promise
export default async function Page({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  const { book } = await searchParams;
  return <Wizard bookId={Number(book)} />;
}
