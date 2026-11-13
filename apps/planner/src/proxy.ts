import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAuth0Mode } from "@/lib/env";

export async function proxy(request: NextRequest) {
  if (!isAuth0Mode()) return NextResponse.next();
  const { getAuth0 } = await import("@/lib/auth0");
  return getAuth0().middleware(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
