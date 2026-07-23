import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getLocalPreviewRole } from "./lib/local-preview";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  // Local development is a read-only preview: lib/auth still rejects all non-GET API calls.
  if (getLocalPreviewRole()) return;

  if (isPublicRoute(request)) {
    return;
  }

  const { isAuthenticated } = await auth();
  if (!isAuthenticated) {
    if (isApiRoute(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect_url", request.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
