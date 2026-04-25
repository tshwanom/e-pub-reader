import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname.toLowerCase();

  if (pathname.startsWith("/uploads/") && pathname.endsWith(".epub")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/uploads/:path*"],
};
