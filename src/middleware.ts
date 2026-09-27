import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|fonts|favicon.ico|icon.svg).*)"],
};
