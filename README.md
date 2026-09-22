# OrcaHouse UI

The Next.js front end for the [OrcaHouse](https://github.com/umccr/orcahouse) data
warehouse. Its first module is a browser for the OrcaVault data mart: every table the
mart GraphQL API exposes, grouped the way the dbt project lays them out, with search,
filtering, sorting, paging and CSV export. Further modules are planned for project overview,
pipeline monitoring, automations, and user-built tables.

This is currently a demo MVP. It is built as static files served under
<https://portal.umccr.org/orcahouse/>, next to the OrcaBus portal, and people sign in with their
UMCCR Google account through the portal's Cognito user pool.

## Related repositories

| Repository                                                                                            | Role                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [umccr/orcahouse](https://github.com/umccr/orcahouse)                                                 | Warehouse infrastructure, including the mart API (`infra/api`) and the legacy dbt project that publishes the `mart` schema |
| [umccr/orcavault](https://github.com/umccr/orcavault)                                                 | Redshift rebuild of the OrcaVault data model                                                                               |
| [umccr/orcahouse-doc](https://github.com/umccr/orcahouse-doc)                                         | Warehouse documentation, glossary and ERDs                                                                                 |
| [umccr/frontend-infrastructure-pipelines](https://github.com/umccr/frontend-infrastructure-pipelines) | The portal's S3 buckets, CloudFront distribution, runtime config (`env.js`) and this app's build/deploy pipeline           |

## Quick start

Needs Node 24, pnpm 10, the AWS CLI and pre-commit. The
[local development guide](docs/local-development.md) covers each step and what to do when one
fails.

```sh
make install
aws sso login --profile dev && export AWS_PROFILE=dev
make start MART_API_TOKEN=<your ID token from portal.umccr.org>
```

Open <http://localhost:3000/orcahouse/> and sign in with your UMCCR Google account.

## Commands

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

## Key things to know

- **One static page.** `next build` exports plain files served under `/orcahouse/`. A table is
  `/orcahouse/?table=<name>`, so one `index.html` serves every URL, and the table, page, sort,
  search and filter all live in the query string for sharing.
- **The API defines the tables.** The UI introspects the mart GraphQL API at runtime, so a new
  mart table appears without code changes. `src/lib/catalog.ts` only adds groups, descriptions
  and STABLE/DEMO status.
- **Nothing environment-specific is in the build.** One artifact is promoted from dev to prod:
  the Cognito settings come from the portal's `env.js` and the mart API host from the page's
  hostname. Never add a backend URL to the `env` block in `next.config.ts`.
- **The mart API is prod-only.** Local development reaches `mart.prod.umccr.org` through a dev
  proxy with your own `MART_API_TOKEN`. The dev portal shows API errors until
  `mart.dev.umccr.org` exists.
- **Some features follow the API's configuration.** Row search needs the API (orcahouse
  `infra/api`) to allow the `includesInsensitive` filter operator; where it does not, the search
  box is hidden.
- **Deploys happen elsewhere.** A push to `main` triggers the pipeline in
  frontend-infrastructure-pipelines, and prod needs a manual approval. Changing the base path
  needs the `cognito_aai` Terraform stack applied first.

## Documentation

| Document                                              | What it covers                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [How it works](docs/how-it-works.md)                  | Request flow, sign-in, runtime schema introspection, and how search, filters, sorting and export work |
| [Local development](docs/local-development.md)        | Prerequisites, running the dev server, the mart API token, environment variables, troubleshooting     |
| [Deployment](docs/deployment.md)                      | The portal pipeline, runtime config, Cognito redirects, and the mart API this app depends on          |
| [Development guide](docs/development-guide.md)        | Project layout, naming and code conventions, common changes, gotchas, known limits                    |
| [OrcaVault project description](docs/OrcaVault-PD.md) | Background on the OrcaVault warehouse the mart tables come from                                       |
