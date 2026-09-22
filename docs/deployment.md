# Deployment

How OrcaHouse UI reaches <https://portal.umccr.org/orcahouse/>, and what it depends on outside
this repository.

## The pipeline

Deployment is owned by
[umccr/frontend-infrastructure-pipelines](https://github.com/umccr/frontend-infrastructure-pipelines),
not by this repository, so there is nothing to run here. A push to `main` triggers
`OrcaHouseAppCICDPipeline`, which:

1. runs `pnpm build`,
2. syncs `out/` to `s3://orcahouse-cloudfront-<account>/orcahouse/`,
3. invokes the portal's config Lambda to write this app's `env.js`.

Dev deploys automatically; prod is behind a manual approval.

That repository also owns the bucket, the `/orcahouse/*` CloudFront behaviour and the
viewer-request rewrite. This app's entry in its registry (`lib/portal/apps.ts`) declares
`pathPrefix: 'orcahouse'` and `clientRouting: 'static-export'`. The latter is why
`trailingSlash: true` matters here: it makes each route export as `<route>/index.html`, which is
what the rewrite resolves to.

## One artifact for every environment

One build is promoted from dev to prod, so nothing environment-specific may be in it:

- **Cognito settings** arrive at runtime through `env.js`, which the app loads from its own base
  path (`/orcahouse/env.js`).
- **The mart API host** is derived from the hostname the page is served from
  (`src/lib/environment.ts`; see [How it works](how-it-works.md#which-api-the-app-calls)).

Do not add a backend URL or any other per-environment value to the `env` block in
`next.config.ts`: Next inlines those values into the bundle at build time, so the dev deployment
would carry them into prod. `MART_API_URL` is deliberately left out of it and is only read by the
local dev proxy.

## Sign-in redirects

Sign-in returns to this app, not the portal home page. The redirect URL is the current origin
plus the base path (`https://portal.umccr.org/orcahouse/` in prod), so it is right in every
environment without configuration.

That exact URL must be registered as a callback and logout URL on the portal's Cognito app
client. The `cognito_aai` Terraform stack generates those URLs from its `portal_app_paths` list.
The same stack registers <http://localhost:3000/orcahouse/> on the localhost app client.

### Changing the base path

The base path (`/orcahouse`) is set in several places that must agree:

1. `BASE_PATH` in `next.config.ts`.
2. `pathPrefix` in the app registry, `lib/portal/apps.ts` in frontend-infrastructure-pipelines.
3. `portal_app_paths` in the `cognito_aai` Terraform stack.

**Apply the `cognito_aai` stack before shipping the change**, or the hosted UI rejects sign-in
with `redirect_mismatch`.

## The mart API

The mart GraphQL API is deployed separately, from the orcahouse repository's `infra/api`
Terraform module, and only to prod (<https://mart.prod.umccr.org>). See that module's README for
the full steps. In short, with prod AWS credentials:

```sh
cd infra/api/lambda-server
pnpm install --frozen-lockfile
pnpm build                     # bundles and zips dist/index.zip

cd ..
terraform init
terraform workspace select prod
terraform plan -var-file="orcavault.tfvars"    # expect only the Lambda function to change
terraform apply -var-file="orcavault.tfvars"
```

This UI depends on how that API is configured:

| API setting                                                                         | What depends on it                                                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| JWT authorizer audience: the portal's Cognito app client                            | Deployed sign-in tokens are accepted; localhost sign-in tokens are not, hence `MART_API_TOKEN`              |
| CORS allowed origins (`portal.umccr.org`, `orcaui.umccr.org`, their `prod` aliases) | The browser can call the API directly. Serving this app from a new hostname needs that origin added         |
| `connectionFilterAllowedOperators`                                                  | The filter builder's operators. Row search needs `includesInsensitive`; without it the search box is hidden |
| `maxRequestLength` (10,000 bytes)                                                   | How many columns one rows query can request                                                                 |

The UI reads the operators from the live schema, so an API change and a UI change can ship in
either order: the UI hides what the API does not offer yet, and picks up a newly allowed operator
on the next page reload.

## No dev mart API

`mart.dev.umccr.org` does not exist yet, so on the dev portal queries show an API error while
sign-in and the catalogue still work. This is deliberate: it is better than the dev deployment
reading production data. Local development points at prod with your own `MART_API_TOKEN` (see
[Local development](local-development.md#the-mart-api-token)).
