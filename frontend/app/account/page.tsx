import Account from "@/components/Account";

// render on each request, so the environment variable below is read when the server runs,
// not baked in (empty) while the Docker image is built
export const dynamic = "force-dynamic";

export default function Page() {
  return <Account bot={process.env.TELEGRAM_BOT_NAME ?? ""} />;
}
