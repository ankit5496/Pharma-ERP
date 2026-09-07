import { cookies } from 'next/headers';

import { SESSION_COOKIE_NAME, type HealthCheckResponse } from '@pharma-erp/types';

import { env } from './env';

/** Shape returned to the UI so a failed call renders as data, not an exception. */
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number | null; error: string };

const DEFAULT_TIMEOUT_MS = 5_000;

interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  timeoutMs?: number;
  /** Serialised as JSON with the appropriate content type. */
  json?: unknown;
  /**
   * Attach the caller's session token from its httpOnly cookie. Server-side
   * only: `cookies()` reads the request via Next's async context and is
   * unavailable in the browser — deliberately, since the token must never be
   * reachable from client-side JavaScript.
   */
  authenticated?: boolean;
}

/**
 * Thin fetch wrapper for the NestJS API.
 *
 * Returns a result object rather than throwing: an unreachable API or a 403 is
 * an expected state that a page has to render, and modelling it as data keeps
 * the handling next to the message the user actually sees.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<ApiResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, json, authenticated = false, ...init } = options;
  const url = `${env.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  if (json !== undefined) headers.set('Content-Type', 'application/json');

  if (authenticated) {
    const token = await getSessionToken();

    if (!token) {
      return { ok: false, status: 401, error: 'Not signed in.' };
    }

    headers.set('Authorization', `Bearer ${token}`);
  }

  // AbortSignal.timeout rather than a manual controller + setTimeout: it cannot
  // leak a pending timer if the request settles first.
  const signal = init.signal ?? AbortSignal.timeout(timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
      // Anything behind a session is per-user and must never be shared from a
      // cache. Callers that want caching should say so explicitly.
      cache: init.cache ?? 'no-store',
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: await readErrorMessage(response) };
    }

    // 204 and friends have no body to parse.
    if (response.status === 204) return { ok: true, data: undefined as T };

    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return {
        ok: false,
        status: null,
        error: `Timed out after ${timeoutMs}ms — is the API running? (${url})`,
      };
    }

    return {
      ok: false,
      status: null,
      error: error instanceof Error ? `${error.message} — ${url}` : `Unknown error — ${url}`,
    };
  }
}

/**
 * The session token for the current server request, from its httpOnly cookie.
 *
 * Returns null rather than throwing when called outside a request context, so a
 * component rendered at build time degrades to "not signed in" instead of
 * failing the build — which is exactly what happens during  when
 * Next collects page data.
 */
async function getSessionToken(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(SESSION_COOKIE_NAME)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Pulls a human-usable message out of a Nest error response.
 *
 * Nest's exception filter returns `{ message: string | string[], error, statusCode }`,
 * and the array form is what the ValidationPipe produces — one entry per failed
 * constraint. Joining them is what turns a 400 into something a form can show.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();

    if (body && typeof body === 'object' && 'message' in body) {
      const message = (body as { message: unknown }).message;

      if (Array.isArray(message)) return message.join('. ');
      if (typeof message === 'string' && message.length > 0) return message;
    }
  } catch {
    // Not JSON — fall through to the status line.
  }

  return `${response.status} ${response.statusText || 'Request failed'}`;
}

/** Calls the API's unauthenticated health endpoint. */
export async function fetchHealth(): Promise<ApiResult<HealthCheckResponse>> {
  return apiFetch<HealthCheckResponse>('/health');
}
