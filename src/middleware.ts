import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";

const { auth } = NextAuth(authConfig);

const dev = process.env.NODE_ENV === "development";
// Signed file URLs are built on S3_ENDPOINT, so previews (img / PDF iframe) must be allowed from it.
const storage = URL.canParse(process.env.S3_ENDPOINT ?? "") ? new URL(process.env.S3_ENDPOINT!).origin : "";

function csp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // Tailwind/Radix/Sonner inline styles
    `img-src 'self' data: blob: ${storage}`,
    `frame-src 'self' ${storage}`,
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

// Passing a handler to auth() skips Auth.js's own sign-in redirect, so it is repeated here.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (!req.auth?.user && pathname !== "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(url);
  }
  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  // Next reads the nonce from the request's CSP header and stamps it on its own scripts.
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", policy);
  return res;
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|fonts|favicon.ico|icon.svg).*)"],
};
