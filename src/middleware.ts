import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/admin", "/student", "/teacher", "/parent", "/application", "/notifications", "/notices", "/settings", "/help", "/verify-email"];

/** Cheap edge check only — real authorisation happens server-side per request. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!req.cookies.get("mdc_session")) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|api/|favicon.ico).*)"] };
