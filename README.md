# OrcaHouse UI

The Next.js front end for the [OrcaHouse](https://github.com/umccr/orcahouse) data
warehouse. Its first module is a browser for the OrcaVault data mart: every table the
mart GraphQL API exposes, grouped the way the dbt project lays them out, with filtering,
sorting, paging and CSV export. Further modules are planned for project overview,
pipeline monitoring, automations, and user-built tables.

This is currently a demo MVP. It is built as static files to be served under
https://portal.umccr.org/mart/, next to the OrcaBus portal, and people sign in with their UMCCR
Google account through the portal's Cognito user pool.

## Related repositories

| Repository                                                                                            | Role                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [umccr/orcahouse](https://github.com/umccr/orcahouse)                                                 | Warehouse infrastructure, including the mart API (`infra/api`) and the legacy dbt project that publishes the `mart` schema |
| [umccr/orcavault](https://github.com/umccr/orcavault)                                                 | Redshift rebuild of the OrcaVault data model                                                                               |
| [umccr/orcahouse-doc](https://github.com/umccr/orcahouse-doc)                                         | Warehouse documentation, glossary and ERDs                                                                                 |
| [umccr/frontend-infrastructure-pipelines](https://github.com/umccr/frontend-infrastructure-pipelines) | The portal's S3 buckets, CloudFront distribution and runtime config (`/env.js`)                                            |

## How it works

```text
Deployed: https://portal.umccr.org/mart/ (static files in S3, behind the portal's CloudFront)
  Browser ──/env.js──────────────> the portal's runtime config: Cognito user pool and app client
  Browser ──GraphQL + ID token───> https://mart.prod.umccr.org/graphql
                                   API Gateway JWT authorizer
                                   -> Lambda (PostGraphile)
                                   -> Aurora PostgreSQL `mart` schema

Local development: http://localhost:3000/mart/ (next dev)
  Browser ──/mart/api/graphql/───> Next.js dev proxy ──MART_API_TOKEN──> https://mart.prod.umccr.org/graphql
```

- **Static export, one page.** `next build` writes plain HTML, CSS and JS to `out/` with
  `basePath: '/mart'`, the counterpart of orca-ui-v2's `base: '/v2/'`. The app is a single
  page: the catalogue is `/mart/` and a table is `/mart/?table=<name>`. One `index.html`
  therefore serves every URL, which is what the portal's CloudFront rewrite expects, and
  tables the build has never seen still open.
- **Cognito sign-in.** `src/lib/auth.ts` configures Amplify for the hosted UI with Google
  federation, as orca-ui-v2 does. Deployed, it reads the portal's `/env.js`, so it uses the
  portal's app client and shares the portal session: anyone signed in to the portal is signed
  in here. That client is also the only one the mart API's authorizer accepts. Locally the
  settings come from `start.sh`. `AuthGate` in the root layout shows the sign-in page to anyone
  signed out, and the avatar menu in the header shows the profile and current token, has a
  theme setting, and signs out.
- **API calls.** Deployed, the browser calls the mart API directly with the ID token; the
  API's CORS policy allows the portal origins. It does not allow `localhost`, so in development
  requests go through `src/app/api/graphql/route.dev.ts`, a same-origin proxy that sends
  `MART_API_TOKEN`. The `.dev.ts` extension is only a page extension under `next dev`, which
  keeps the proxy out of the static export.
- **Runtime introspection.** PostGraphile generates the API from the `mart` schema, so the
  UI introspects it on load and builds each table view from the live columns, filter
  operators and sort keys. Browsing a new mart table needs no code.
- **Catalogue registry.** `src/lib/catalog.ts` maps dbt table names to groups, descriptions
  and stability. The groups mirror `orcavault/models/mart/<group>/` in the orcahouse repo,
  and the descriptions and STABLE/DEMO remarks come from its
  `seeds/dictionary/dictionary__data_mart_catalog.csv`. The live schema stays the source
  of truth: catalogued tables missing from the API are shown as unavailable, and API
  collections missing from the registry appear under "Other".
- **Side navigation.** Groups fold, and the folds are remembered in the browser. The search box
  filters tables as you type: each word matches a table name fuzzily (`fqh` finds
  `fastq_history`), or appears in the group name or description.
- **Shareable URLs.** The table, page, page size, sort and filter live in the query string, for
  example
  `/mart/?table=lims&sort=SEQUENCING_RUN_DATE_DESC&filter={"and":[{"libraryId":{"equalTo":"L2400001"}}]}`.

## Run locally

Requires Node 24 (see `.nvmrc`), pnpm 10 (`corepack enable` picks the version from
`package.json`) and the AWS CLI.

```sh
make install
aws sso login --profile dev && export AWS_PROFILE=dev
make start MART_API_TOKEN=<your ID token from portal.umccr.org>
```

`make start` sources `start.sh`, the same wrapper orca-ui-v2 uses: it reads the Cognito sign-in
settings for the localhost app client from SSM Parameter Store in the dev account, exports them
as `NEXT_PUBLIC_*` variables and starts the dev server. Open http://localhost:3000/mart/ (the
root `/` redirects there) and sign in with your UMCCR Google account.

The mart API is only deployed to prod, so the Makefile points `MART_API_URL` at
https://mart.prod.umccr.org. It does not accept localhost sign-in tokens, so in local
development the proxy sends your own token instead: copy the ID token from portal.umccr.org
(profile menu > Token) and pass it as `MART_API_TOKEN`. Portal ID tokens last up to a day; when
API calls fail with "The mart API rejected MART_API_TOKEN", restart with a fresh one. The static
build has no proxy, so it never uses `MART_API_TOKEN`.

The dev server must stay on port 3000, the only callback URL registered on the Cognito
localhost app client. `make dev` starts it without the Cognito settings, so the sign-in page
only reports that sign-in is not configured.

| Variable                              | Set by                                                          | Purpose                                                 |
| ------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID`    | `start.sh`, from `/data_portal/client/cog_user_pool_id`         | Cognito user pool                                       |
| `NEXT_PUBLIC_COGNITO_OAUTH_DOMAIN`    | `start.sh`, from `/data_portal/client/oauth_domain`             | Hosted UI domain prefix (a full host name also works)   |
| `NEXT_PUBLIC_COGNITO_APP_CLIENT_ID`   | `start.sh`, from `/data_portal/client/cog_app_client_id_local`  | Localhost app client                                    |
| `NEXT_PUBLIC_OAUTH_REDIRECT_SIGN_IN`  | `start.sh`, from `/data_portal/client/oauth_redirect_in_local`  | Where Cognito returns after sign-in                     |
| `NEXT_PUBLIC_OAUTH_REDIRECT_SIGN_OUT` | `start.sh`, from `/data_portal/client/oauth_redirect_out_local` | Where Cognito returns after sign-out                    |
| `NEXT_PUBLIC_COGNITO_REGION`          | `start.sh` (`ap-southeast-2`)                                   | Region of the user pool                                 |
| `MART_API_URL`                        | Makefile, default `https://mart.prod.umccr.org`                 | Base URL of the mart API, built into the static export  |
| `MART_API_TOKEN`                      | you, e.g. `make start MART_API_TOKEN=...`                       | Local development only: bearer token for mart API calls |

The deployed app does not use the `NEXT_PUBLIC_*` values: it reads the same settings from the
portal's `/env.js`.

## Deployment

`pnpm build` (or `make build`) writes the static site to `out/`. Every URL in it starts with
`/mart/`. To serve it at https://portal.umccr.org/mart/ the way orca-ui-v2 is served at `/v2/`,
the portal's CloudFront distribution (`lib/orcaui/infrastructure-stack.ts` in
frontend-infrastructure-pipelines) needs:

1. A mart UI bucket, with `out/` uploaded under the `mart/` prefix, for example
   `aws s3 sync out/ s3://<mart-ui-bucket>/mart/ --delete`.
2. A `/mart/*` behaviour with that bucket as its origin and the `spa-rewrite.js` viewer-request
   function, given a `/mart` branch like its `/v2` one so that paths without a file extension
   load `/mart/index.html`. Every file in `out/` has an extension the function already passes
   through (`html`, `js`, `css`, `txt`, `svg`, `png`).
3. A CloudFront invalidation of `/mart/*` after each upload.

Only `MART_API_URL` is fixed at build time. The Cognito settings come from the portal's
`/env.js` at runtime, so the portal's config Lambda needs no change. A sign-in started on
/mart/ returns to the portal home page, because https://portal.umccr.org is the only callback
URL on the portal's app client; coming straight back to /mart/ would need
https://portal.umccr.org/mart/ registered there too.

## Development workflow

| Command           | What it does                                                     |
| ----------------- | ---------------------------------------------------------------- |
| `make install`    | Installs the pre-commit hooks and the pinned dependencies        |
| `make check`      | Runs every pre-commit hook: lint, format, secret and file checks |
| `make baseline`   | Regenerates `.secrets.baseline` after an intentional change      |
| `make start`      | Dev server on port 3000 with the Cognito settings from SSM       |
| `make dev`        | Dev server without them (sign-in disabled)                       |
| `pnpm build`      | Static export to `out/`                                          |
| `pnpm lint`       | ESLint                                                           |
| `pnpm type-check` | TypeScript                                                       |
| `pnpm format`     | Prettier, writing changes                                        |

Pull requests run the same checks plus a production build through
`.github/workflows/pr-tests.yml`. Dependabot proposes weekly dependency and action updates.

## Project layout

```text
src/
  app/
    layout.tsx                     app shell: theme script, auth gate, header, side navigation, Apollo provider
    page.tsx                       the one page
    api/graphql/route.dev.ts       local-development proxy to the mart API (not in the build)
  components/
    MartView.tsx                   the catalogue, or a table when the URL has ?table=
    TableBrowser.tsx               orchestrates schema, URL state, query and layout
    DataTable.tsx  FilterBuilder.tsx  Pagination.tsx  ColumnPicker.tsx
    CatalogHome.tsx  SideNav.tsx  AppHeader.tsx
    AuthGate.tsx                   resolves the Cognito session; shows SignInPage when signed out
    UserMenu.tsx                   header avatar menu: ProfileDialog, TokenDialog, SettingsDialog
  hooks/
    useMartSchema.ts               introspection query, cached by Apollo
    useTheme.ts                    stored light/dark/system preference
    useCollapsedGroups.ts          side navigation folds, remembered in localStorage
  lib/
    auth.ts                        Amplify configuration (portal /env.js or start.sh), ID token, return path
    apollo.ts                      Apollo Client factory: the mart API directly, or the dev proxy
    catalog.ts                     table registry mirroring the dbt mart folders
    schema.ts                      introspection helpers: collections, columns, filters, sorts
    query-builder.ts               builds the per-table rows query
    table-search.ts                fuzzy table search for the side navigation
    filters.ts  csv.ts  theme.ts
```

## Adding or changing a table

Nothing is required for a new mart table to appear: it shows up under "Other" as soon as
the API exposes it. To place it in a group with a description, status and default sort,
add an entry to `src/lib/catalog.ts`. The `collection` value is the PostGraphile root
field, `all` + the plural PascalCase table name (`fastq_history` becomes `allFastqHistories`).

## Known limits and next steps

- **Authentication.** Sign-in happens in the browser and the tokens live in localStorage, shared
  with the portal on portal.umccr.org. The dev proxy forwards whatever bearer token it has and
  relies on the API's authorizer to check it.
- **Authorization.** Any valid token can read every mart table today: the API runs with
  `ignoreRBAC` and one shared read-only database user. Showing different tables to
  different users must be enforced in the API or with Postgres roles, not in this UI.
- **Catalogue drift.** Descriptions and STABLE/DEMO remarks are a copy of the dbt seed.
  Reading them live from the `catalog` mart table would remove the duplication.
- **Query limits.** The API caps request bodies at 10,000 bytes and uses offset pagination,
  so very wide tables or very deep pages will be slow or rejected.
- **Deployment.** The mart UI bucket, the `/mart/*` CloudFront behaviour and the `/mart` branch
  of the rewrite function do not exist yet; see [Deployment](#deployment). Only prod is planned
  for now, as the mart API only runs there.
