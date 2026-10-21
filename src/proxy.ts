import { NextResponse, type NextRequest } from "next/server";

const INSPECTOR_COOKIE = "inspector_id";

/**
 * Tags each request so the inspector can group the calls it made, and stamps the browser's
 * inspector id so /inspector shows each browser only its own calls.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-request-id", crypto.randomUUID());
  headers.set("x-pathname", request.nextUrl.pathname);
  // A random id per browser (sign-in runs before any session, so the session can't be the key).
  const existing = request.cookies.get(INSPECTOR_COOKIE)?.value;
  const inspectorId = existing || crypto.randomUUID();
  headers.set("x-inspector-id", inspectorId); // overwrites anything the client sent
  const response = NextResponse.next({ request: { headers } });
  if (!existing) {
    response.cookies.set(INSPECTOR_COOKIE, inspectorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
