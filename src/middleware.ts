import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const signedIn = !!request.auth?.user;
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/auth") || pathname === "/api/signup") return NextResponse.next();
  if (!signedIn && pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!signedIn && pathname !== "/") {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
