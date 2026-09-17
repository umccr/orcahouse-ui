import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

// Served under this path, e.g. https://portal.umccr.org/orcahouse/, as orca-ui-v2 is under /v2/.
// The portal's app registry (lib/portal/apps.ts in frontend-infrastructure-pipelines) must agree:
// its `pathPrefix` for this app is 'orcahouse'.
const BASE_PATH = '/orcahouse';

export default function config(phase: string): NextConfig {
  const development = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    reactStrictMode: true,
    // Stop `next dev` writing AGENTS.md and CLAUDE.md when it detects an AI coding agent.
    agentRules: false,
    basePath: BASE_PATH,
    // Links end in a slash, so every URL matches the CloudFront path pattern /orcahouse/*, and each
    // route exports as <route>/index.html for the portal's viewer-request rewrite to resolve.
    trailingSlash: true,
    // `next build` writes a static site to out/ for the orcahouse UI bucket. The dev server keeps
    // its server features for the local API proxy.
    output: development ? undefined : 'export',
    // Only `next dev` picks up *.dev.ts routes: the proxy in src/app/api/graphql/route.dev.ts.
    pageExtensions: development ? ['tsx', 'ts', 'dev.ts'] : ['tsx', 'ts'],
    images: { unoptimized: true },
    env: {
      NEXT_PUBLIC_BASE_PATH: BASE_PATH,
    },
    // MART_API_URL is deliberately NOT declared here. Next inlines `env` values into the client
    // bundle at build time, and the portal pipeline builds once and promotes the same artifact from
    // dev to prod, so a baked-in API host would make the dev deployment call the prod API. The
    // deployed app derives the host from its own hostname instead: see src/lib/environment.ts.
    // The dev-only proxy still reads process.env.MART_API_URL directly, server-side.

    // Cognito's localhost app client calls back to http://localhost:3000/.
    ...(development && {
      redirects: async () => [
        { source: '/', destination: `${BASE_PATH}/`, basePath: false, permanent: false },
      ],
    }),
  };
}
