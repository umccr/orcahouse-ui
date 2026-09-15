import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

// Served under this path, e.g. https://portal.umccr.org/mart/, as orca-ui-v2 is under /v2/.
const BASE_PATH = '/mart';

export default function config(phase: string): NextConfig {
  const development = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    reactStrictMode: true,
    // Stop `next dev` writing AGENTS.md and CLAUDE.md when it detects an AI coding agent.
    agentRules: false,
    basePath: BASE_PATH,
    // Links end in a slash, so every URL matches the CloudFront path pattern /mart/*.
    trailingSlash: true,
    // `next build` writes a static site to out/ for the mart S3 bucket. The dev server keeps
    // its server features for the local API proxy.
    output: development ? undefined : 'export',
    // Only `next dev` picks up *.dev.ts routes: the proxy in src/app/api/graphql/route.dev.ts.
    pageExtensions: development ? ['tsx', 'ts', 'dev.ts'] : ['tsx', 'ts'],
    images: { unoptimized: true },
    env: {
      NEXT_PUBLIC_BASE_PATH: BASE_PATH,
      // The mart API is only deployed to prod. The Makefile exports the same default.
      MART_API_URL: (process.env.MART_API_URL || 'https://mart.prod.umccr.org').replace(/\/$/, ''),
    },
    // Cognito's localhost app client calls back to http://localhost:3000/.
    ...(development && {
      redirects: async () => [
        { source: '/', destination: `${BASE_PATH}/`, basePath: false, permanent: false },
      ],
    }),
  };
}
