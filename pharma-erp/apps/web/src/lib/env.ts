/**
 * Validates the web app's environment at module load, which happens during
 * `next build` and at the start of `next dev` — so a missing variable is a
 * build/boot failure rather than a broken page at runtime.
 *
 * Hand-rolled rather than schema-library-based on purpose: this runs in the
 * client bundle too, and there is no reason to ship a validator to the browser
 * for two variables.
 */

interface WebEnv {
  /** Base URL of the API, no trailing slash. */
  readonly apiUrl: string;
  readonly isProduction: boolean;
}

function readApiUrl(): string {
  // NEXT_PUBLIC_* must be referenced as a static property access for Next's
  // build-time inlining to replace it in the client bundle. `process.env[key]`
  // would silently be undefined in the browser.
  const raw = process.env.NEXT_PUBLIC_API_URL;

  if (!raw || raw.trim() === '') {
    throw new Error(
      [
        'NEXT_PUBLIC_API_URL is not set.',
        '  Local:  copy .env.example to .env at the repo root, set it to http://localhost:4000',
        '  Hosted: set it as an environment variable on the WEB service, pointing at the API',
        '          service URL. NEXT_PUBLIC_* values are inlined at BUILD time, so it must be',
        '          present when the build runs — not only at runtime.',
      ].join('\n'),
    );
  }

  let trimmed = raw.trim().replace(/\/+$/, '');

  // Accept a bare hostname and assume https. Render's Blueprint `fromService`
  // exposes a service's address as `host`, which is a hostname with no scheme
  // ("pharma-erp-api.onrender.com") — there is no property that includes one.
  // Rejecting that would make the auto-wiring in render.yaml unusable and force
  // every URL to be pasted by hand.
  //
  // localhost is the one case that must NOT be upgraded to https: a local API
  // serves plain http, and silently rewriting it produces a connection error
  // that looks nothing like its cause.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(trimmed);
    trimmed = `${isLoopback ? 'http' : 'https'}://${trimmed}`;
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`NEXT_PUBLIC_API_URL is not a usable URL or hostname (received: ${raw}).`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `NEXT_PUBLIC_API_URL must be http or https (received protocol: ${parsed.protocol}).`,
    );
  }

  return trimmed;
}

export const env: WebEnv = {
  apiUrl: readApiUrl(),
  isProduction: process.env.NODE_ENV === 'production',
};
