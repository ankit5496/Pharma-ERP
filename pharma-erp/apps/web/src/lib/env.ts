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
      'NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env at the repo root ' +
        '(see README, "Environment") and set it to the API base URL, e.g. http://localhost:4000',
    );
  }

  const trimmed = raw.trim().replace(/\/+$/, '');

  try {
    // Throws on a value that is not an absolute URL — a common mistake is
    // setting a bare host or a path.
    new URL(trimmed);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_API_URL must be an absolute URL including the scheme (received: ${raw}).`,
    );
  }

  return trimmed;
}

export const env: WebEnv = {
  apiUrl: readApiUrl(),
  isProduction: process.env.NODE_ENV === 'production',
};
