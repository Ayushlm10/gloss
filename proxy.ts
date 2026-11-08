import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { localMode } from "./lib/local-mode";

const hosted = clerkMiddleware();

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!localMode) return hosted(req, event);
  const expected = "127.0.0.1:3100";
  if (process.env.VERCEL || req.headers.get("host") !== expected) return new NextResponse("Local mode requires its loopback launcher.", { status: 403 });
  const pathname = req.nextUrl.pathname;
  if (pathname === "/mcp" || pathname.startsWith("/mcp/")) return new NextResponse(null, { status: 404 });
  if (pathname.startsWith("/api/")) {
    const allowed = ["/api/ask", "/api/brief", "/api/shelve", "/api/key", "/api/import"];
    if (!allowed.includes(pathname)) return new NextResponse(null, { status: 404 });
    const origin = req.headers.get("origin");
    if (origin !== `http://${expected}` && !(pathname === "/api/key" && req.method === "GET" && !origin)) return new NextResponse("Invalid origin.", { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|mjs|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
