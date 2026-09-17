// Development only: the `.dev.ts` extension is a page extension in `next dev` alone (see
// next.config.ts), so this proxy is not part of the static export.
export const dynamic = 'force-dynamic';

// Read straight from the shell (the Makefile exports it), not from next.config.ts's `env` block:
// this handler only ever runs in `next dev`, server-side, and declaring it in `env` would inline the
// value into the client bundle, where the deployed app must not have a baked-in API host.
// The deployed app derives its endpoint from the hostname instead: see src/lib/environment.ts.
const MART_API_URL = (process.env.MART_API_URL || 'https://mart.prod.umccr.org').replace(/\/$/, '');

// Your own bearer token for the mart API, such as the ID token from portal.umccr.org
// (profile menu > Token), sent instead of the signed-in session's token.
const MART_API_TOKEN = process.env.MART_API_TOKEN?.replace(/^bearer\s+/i, '').trim() || null;

const unauthenticated = (message: string) =>
  Response.json({ errors: [{ message, extensions: { code: 'UNAUTHENTICATED' } }] });

/**
 * Same-origin proxy for the mart GraphQL API on localhost.
 *
 * The mart API only allows CORS from the portal origins, where the deployed app calls it
 * directly. On localhost this handler forwards the request server-to-server, with
 * MART_API_TOKEN when set, or else the signed-in session's token (which the API rejects,
 * as it only accepts tokens from the portal's app client).
 *
 * A rejected token is returned as a GraphQL error with a 200 status so Apollo surfaces
 * the message to the UI instead of a generic network failure.
 */
export async function POST(request: Request): Promise<Response> {
  const authorization = MART_API_TOKEN
    ? `Bearer ${MART_API_TOKEN}`
    : request.headers.get('authorization');
  if (!authorization) {
    return unauthenticated('Not signed in. Sign in again to query the mart API.');
  }

  const upstream = await fetch(`${MART_API_URL}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/graphql-response+json, application/json',
      authorization,
    },
    body: await request.text(),
    cache: 'no-store',
  });

  if (upstream.status === 401 || upstream.status === 403) {
    return unauthenticated(
      MART_API_TOKEN
        ? `The mart API rejected MART_API_TOKEN (${upstream.status}). It may have expired: restart with a fresh token.`
        : `The mart API rejected the sign-in token (${upstream.status}). Locally, pass your own token: make start MART_API_TOKEN=<token>.`
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
