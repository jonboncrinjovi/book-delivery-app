import Track from "@/components/Track";

// params: the [token] part of the address; in Next.js 15+ it arrives as a Promise
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Track token={token} />;
}
