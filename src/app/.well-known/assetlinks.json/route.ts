import { connection } from "next/server";
import { config } from "@/lib/config";

export async function GET() {
  await connection(); // read env per request, not at build
  const package_name = config.androidPackageName;
  const sha256_cert_fingerprints = config.androidCertFingerprints;
  if (!package_name || !sha256_cert_fingerprints.length) return new Response(null, { status: 404 });
  return Response.json([
    {
      relation: ["delegate_permission/common.get_login_creds"],
      target: { namespace: "android_app", package_name, sha256_cert_fingerprints },
    },
  ]);
}
