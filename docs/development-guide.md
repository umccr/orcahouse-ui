# Development guide

Where the code lives, the conventions it follows, how to make common changes, and what to watch
out for. For the commands, see the [README](../README.md#commands); for the runtime behaviour, see
[How it works](how-it-works.md).

## Project layout

```text
Makefile                           install, check, start/dev, build; MART_API_URL and MART_API_TOKEN for the dev proxy
start.sh                           local development: Cognito settings from SSM, then next dev on port 3000
next.config.ts                     base path, static export, dev-only proxy route
docs/                              this documentation
src/
  app/
    layout.tsx                     app shell: theme script, auth gate, header, side navigation, Apollo provider
    page.tsx                       the one page
    globals.css                    Tailwind setup, colour tokens, dark mode variant
    api/graphql/route.dev.ts       local-development proxy to the mart API (not in the build)
  components/
    MartView.tsx                   the catalogue, or a table when the URL has ?table=
    CatalogHome.tsx                home page: tables by group, with how many are live
    TableBrowser.tsx               one table: schema metadata, URL state, rows query and layout
    RowSearch.tsx                  search box: a contains search on one text column
    FilterBuilder.tsx              advanced filter: conditions combined with AND or OR
    DataTable.tsx                  the rows, sortable headers and cell formatting
    Pagination.tsx                 page and page-size controls
    ColumnPicker.tsx               show and hide columns
    SideNav.tsx                    table tree with fuzzy search and foldable groups
    AuthGate.tsx                   resolves the Cognito session; shows SignInPage when signed out
    AppHeader.tsx  UserMenu.tsx    header and avatar menu: ProfileDialog, TokenDialog, SettingsDialog
    ApolloWrapper.tsx              Apollo provider
    ThemeSync.tsx                  keeps <html data-theme> in step with the stored preference
    Dialog.tsx  ErrorNotice.tsx  StatusBadge.tsx
    ui.ts                          shared Tailwind class strings: BUTTON, BUTTON_PRIMARY, INPUT, MENU
  hooks/
    useMartSchema.ts               introspection query, cached by Apollo
    useTheme.ts                    stored light/dark/system preference
    useCollapsedGroups.ts          side navigation folds, remembered in localStorage
    useIsClient.ts  useNow.ts      client-only rendering; a ticking clock for token expiry
  lib/
    auth.ts                        Amplify configuration (portal /env.js or start.sh), ID token, return path
    apollo.ts                      Apollo Client factory: the mart API directly, or the dev proxy
    environment.ts                 deployed environment and mart API host from the hostname
    catalog.ts                     table registry mirroring the dbt mart folders
    schema.ts                      introspection helpers: collections, columns, filters, sorts
    query-builder.ts               builds the per-table rows query
    filters.ts                     advanced filter state, its URL JSON, combining filters
    row-search.ts                  the row search: searchable columns and its filter clause
    table-search.ts                fuzzy table search for the side navigation
    csv.ts  theme.ts
```

## Conventions

### Files

| Kind             | Convention                                                      | Example                             |
| ---------------- | --------------------------------------------------------------- | ----------------------------------- |
| React components | PascalCase `.tsx`, exporting one component named after the file | `RowSearch.tsx` exports `RowSearch` |
| Hooks            | `use` + PascalCase, `.ts`, in `src/hooks/`                      | `useMartSchema.ts`                  |
| Library modules  | Lowercase kebab-case `.ts` in `src/lib/`, no React              | `row-search.ts`, `query-builder.ts` |
| Dev-only routes  | `.dev.ts`, which only `next dev` treats as a page extension     | `src/app/api/graphql/route.dev.ts`  |
| Documentation    | Lowercase kebab-case `.md` in `docs/`                           | `local-development.md`              |

### Code

- **Exports.** Named exports throughout. Default exports only where Next.js requires them
  (`page.tsx`, `layout.tsx`).
- **Names.** Types and interfaces in PascalCase, module-level constants in UPPER_SNAKE_CASE
  (`PAGE_SIZES`, `OPERATOR_ORDER`, `BUTTON`), everything else in camelCase.
- **Imports.** The `@/` alias for anything under `src/` (`@/lib/schema`), and `./` for siblings
  in the same folder (`./ui`).
- **Where logic goes.** Data logic that does not need React, such as parsing the schema,
  building queries and filters, and matching searches, lives in `src/lib/` as plain functions.
  Components hold state and layout.
- **Comments** explain why, not what. Exported functions and components get a short doc comment.
- **Spelling.** British English in comments, docs and UI text ("catalogue", "colour").
- **Formatting.** Prettier: single quotes (JSX too), semicolons, 100-column lines, ES5 trailing
  commas, and Tailwind classes sorted by `prettier-plugin-tailwindcss`. EditorConfig: UTF-8, LF,
  two-space indents, tabs in the Makefile. Run `pnpm format` rather than formatting by hand.

### Styling

- **Tailwind CSS v4**, configured in `src/app/globals.css`, and no component library.
- **Colour tokens** come in light and dark pairs: `signal`, `canvas`, `surface`, `line`, `muted`
  and `ink`, each with a `-dark` twin, plus `raised-dark`. Use them in pairs, for example
  `text-muted dark:text-muted-dark`.
- **Dark mode** is the `dark:` variant, which follows `<html data-theme="dark">` rather than the
  system media query, so the user's setting wins.
- **Controls** reuse the class strings in `src/components/ui.ts` (`BUTTON`, `BUTTON_PRIMARY`,
  `INPUT`, `MENU`), so buttons and inputs line up at the same height.
- **Icons** come from `lucide-react`, with `aria-hidden='true'` when they are decorative.

### Names shared with the API, the URL and the browser

| Thing                     | Convention                                                  | Example                                                       |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Catalogue `table`         | The dbt model name, in snake_case; also the `?table=` value | `fastq_history`                                               |
| Root field (`collection`) | `all` + the plural PascalCase table name                    | `allFastqHistories`                                           |
| GraphQL types             | Singular node, `<Node>Filter`, `<PluralNodes>OrderBy`       | `FastqHistory`, `FastqHistoryFilter`, `FastqHistoriesOrderBy` |
| Columns                   | camelCase of the snake_case database column                 | `sequencing_run_id` becomes `sequencingRunId`                 |
| Sort values               | The column in UPPER_SNAKE_CASE plus `_ASC` or `_DESC`       | `SEQUENCING_RUN_DATE_DESC`                                    |
| Column headers            | `humanize()`, keeping the acronyms listed in `ACRONYMS`     | "Sequencing Run ID"                                           |
| URL parameters            | Short lowercase words                                       | `table`, `page`, `size`, `sort`, `filter`, `q`, `qcol`        |
| Browser storage keys      | Prefixed `orcahouse-ui.`                                    | `orcahouse-ui.theme`, `orcahouse-ui.sidenav-collapsed`        |

## Common changes

### Adding or changing a table

Nothing is required for a new mart table to appear: it shows up under "Other" as soon as the API
exposes it. To place it in a group with a description, status and default sort, add an entry to
`src/lib/catalog.ts`:

- `table`: the dbt model name.
- `collection`: the PostGraphile root field, `all` + the plural PascalCase table name
  (`fastq_history` becomes `allFastqHistories`).
- `description` and `status`: from `orcavault/seeds/dictionary/dictionary__data_mart_catalog.csv`
  in the orcahouse repo.
- `defaultSort` (optional): an orderBy value such as `SEQUENCING_RUN_DATE_DESC`. Without it the
  table sorts by its first date or datetime column, newest first, if it has one.

### Adding a filter operator

1. Allow it in the API: `connectionFilterAllowedOperators` in the orcahouse repo's
   `infra/api/lambda-server/src/postgraphile.ts`, then deploy the API (see
   [Deployment](deployment.md#the-mart-api)).
2. Add it to `OPERATOR_ORDER` and `OPERATOR_LABELS` in `src/lib/schema.ts`. The filter builder
   only offers operators it knows, in that order, and the first one is the default for a new
   condition.
3. If its value is not a plain string, number, date or boolean, handle it in `coerceValue`
   (`src/lib/filters.ts`) and `ValueInput` (`FilterBuilder.tsx`).

### Adding a URL parameter

Read it with `params.get()` in `TableBrowser` and write it through `update(patch, replace)`.
Leave the default value out of the URL, reset `page` when the change alters which rows match, and
pass `replace = true` for changes that should not add a history entry, such as typing.

## Gotchas

- **Nothing environment-specific in the build.** Never add a backend URL to the `env` block in
  `next.config.ts`; Next inlines it at build time and one artifact serves dev and prod.
- **Base path changes need Cognito first.** Apply the `cognito_aai` stack before shipping, or
  sign-in fails with `redirect_mismatch` (see [Deployment](deployment.md#changing-the-base-path)).
- **Port 3000 locally.** It is the only callback registered on the Cognito localhost app client.
- **`.dev.ts` files are not deployed.** Anything the static site needs cannot live in one.
- **`useSearchParams` needs a Suspense boundary** for the static export to build. `page.tsx`
  wraps `MartView`, and the layout wraps `SideNav`; keep new users of it inside one.
- **Never send an empty filter.** The API rejects `{}`. Build filters with `combineFilters`,
  which drops empty parts.
- **Requests are capped at 10,000 bytes.** The rows query requests every column, which is fine
  for today's tables but not for a table with hundreds of columns.
- **The schema is read once per page load.** After an API change, reload to see it.
- **The theme exists twice.** `THEME_SCRIPT` in `src/lib/theme.ts` runs before React; keep it in
  step with `applyTheme` in the same file.
- **Never commit tokens.** Pass `MART_API_TOKEN` on the command line rather than editing the
  Makefile. After an intentional change that trips detect-secrets, run `make baseline`.
- **Markdown-only pull requests skip CI** (`paths-ignore` in `.github/workflows/pr-tests.yml`),
  so run `make check` locally before pushing docs.

## Known limits and next steps

- **Authentication.** Sign-in happens in the browser and the tokens live in `localStorage`,
  shared with the portal on portal.umccr.org. The dev proxy forwards whatever bearer token it has
  and relies on the API's authorizer to check it.
- **Authorization.** Any valid token can read every mart table today: the API runs with
  `ignoreRBAC` and one shared read-only database user. Showing different tables to different
  users must be enforced in the API or with Postgres roles, not in this UI.
- **Catalogue drift.** Descriptions and STABLE/DEMO remarks are a copy of the dbt seed. Reading
  them live from the `catalog` mart table would remove the duplication.
- **Query limits.** The API caps request bodies at 10,000 bytes and uses offset pagination, so
  very wide tables or very deep pages will be slow or rejected.
- **Search cost.** A contains search (`ILIKE '%text%'`) cannot use the tables' btree indexes, so
  it reads the whole table. That is fine at today's sizes, up to about 400,000 rows in
  `fastq_history`. If it gets slow, add `pg_trgm` GIN indexes on the most searched columns in the
  dbt models.
- **No dev mart API.** `mart.dev.umccr.org` does not exist yet, so on the dev portal queries show
  an API error while sign-in and the catalogue still work (see
  [Deployment](deployment.md#no-dev-mart-api)).
- **CSV export is one page.** Export CSV downloads the rows on screen, at most 100. Exporting a
  whole filtered table would need paging through the API or a server-side export.
