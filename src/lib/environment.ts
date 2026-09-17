/**
 * Which deployed environment the app is running in, derived from the hostname in the browser.
 *
 * The portal builds each app once and promotes the same artifact from dev to prod, so no backend
 * host may be baked in at build time. Resolving it from `window.location.hostname` keeps one
 * artifact valid everywhere and matches how the sibling Hub app resolves its own environment.
 *
 * Hostname sets mirror the CloudFront aliases in the portal's infrastructure stack.
 */

export type DeployedEnvironment = 'dev' | 'stg' | 'prod';

const STG_HOSTNAMES = new Set(['orcaui.stg.umccr.org', 'portal.stg.umccr.org']);

const PROD_HOSTNAMES = new Set([
  'orcaui.umccr.org',
  'orcaui.prod.umccr.org',
  'portal.umccr.org',
  'portal.prod.umccr.org',
]);

/**
 * Deployed environment for a hostname.
 *
 * Anything unrecognised resolves to `dev`, so a new or mistyped hostname fails towards the
 * non-production API rather than towards prod.
 */
export function resolveEnvironmentFromHostname(hostname: string): DeployedEnvironment {
  if (PROD_HOSTNAMES.has(hostname)) return 'prod';
  if (STG_HOSTNAMES.has(hostname)) return 'stg';
  return 'dev';
}

/**
 * Base URL of the mart API for a hostname, without a trailing slash.
 *
 * Only `mart.prod.umccr.org` exists today. On the dev portal this resolves to
 * `mart.dev.umccr.org`, which is not deployed yet, so queries surface an API error in the UI until
 * it is. That is intended: it is better than the dev deployment silently reading production data.
 */
export function martApiUrl(hostname: string): string {
  return `https://mart.${resolveEnvironmentFromHostname(hostname)}.umccr.org`;
}
