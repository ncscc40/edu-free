import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const roleRoutes: Record<string, string[]> = {
  admin: ["/admin"],
  teacher: ["/teacher"],
  student: ["/student"],
};

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("access_token")?.value;
  const role = request.cookies.get("user_role")?.value;

  if (!token || !role) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (role === "admin" && matchesPrefix(pathname, roleRoutes.admin)) return NextResponse.next();
  if (role === "teacher" && matchesPrefix(pathname, roleRoutes.teacher)) return NextResponse.next();
  if (role === "student" && matchesPrefix(pathname, roleRoutes.student)) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
