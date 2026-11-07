// The same choice for pages assembled on the server: read from the cookie.
import { cookies } from "next/headers";

export async function getV() {
  const form = (await cookies()).get("address")?.value;
  return (vy: string, ty: string) => (form === "ty" ? ty : vy);
}
