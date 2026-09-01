import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Routes reachable without signing in. Everything else requires a session —
 * the default is protected, so a new page is covered the moment it is added and
 * has to be listed here deliberately to be exposed.
 */
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  // Next's own error pages, so a signed-out 404 does not become a redirect loop.
  '/_not-found',
]);

/**
 * Routes a signed-in user may reach before they have a company. Onboarding
 * obviously, plus sign-out, which must always work.
 */
const isPreOnboardingRoute = createRouteMatcher(['/onboarding(.*)']);

export default clerkMiddleware(async (auth, request) => {
  const { userId, redirectToSignIn } = await auth();
  const { pathname } = request.nextUrl;

  if (isPublicRoute(request)) {
    // A signed-in user landing on sign-in/sign-up has no business there.
    if (userId && (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up'))) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: request.url });
  }

  // Note what this middleware deliberately does NOT do: decide whether the user
  // has a company. That answer lives in our Postgres, and reaching it needs a
  // verified API call — too expensive for the edge, on every asset request.
  // Instead each protected page loads the session via requireSession() and
  // redirects to /onboarding itself. The middleware's job here is only "is there
  // a Clerk session at all".
  if (isPreOnboardingRoute(request)) {
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next internals and static files unless they appear in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
};
