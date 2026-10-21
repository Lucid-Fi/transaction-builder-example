import { connection } from "next/server";
import { config } from "@/lib/config";

export async function GET() {
  await connection(); // read env per request, not at build
  const origins = config.webauthnRelatedOrigins;
  if (!origins.length) return new Response(null, { status: 404 });
  return Response.json({ origins });
}
