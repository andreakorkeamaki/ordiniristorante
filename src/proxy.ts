import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getHostRedirect, getHostRoutingConfig } from "@/lib/host-routing";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const hostRedirect = getHostRedirect(request.nextUrl, getHostRoutingConfig());
  if (hostRedirect) return NextResponse.redirect(hostRedirect);

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
