# How it works

How OrcaHouse UI is served, how it signs people in and reaches the mart API, and how the table
view turns URL state into GraphQL queries. To run it, see [Local development](local-development.md);
for where the code lives, see the [Development guide](development-guide.md).

## Overview

```text
Deployed: https://portal.umccr.org/orcahouse/ (static files in S3, behind the portal's CloudFront)
  Browser ──/orcahouse/env.js────> the portal's runtime config: Cognito user pool and app client
  Browser ──GraphQL + ID token───> https://mart.<env>.umccr.org/graphql
                                   API Gateway JWT authorizer
                                   -> Lambda (PostGraphile)
                                   -> Aurora PostgreSQL `mart` schema

Local development: http://localhost:3000/orcahouse/ (next dev)
  Browser ──/orcahouse/api/graphql/──> Next.js dev proxy ──MART_API_TOKEN──> https://mart.prod.umccr.org/graphql
```

The app has no server of its own. It is a static Next.js export that runs in the browser: it
signs the user in with Cognito, then calls the mart GraphQL API with their ID token.

## What happens on a page load

1. **Theme.** An inline script in `<head>` (`src/lib/theme.ts`) sets `data-theme` on `<html>`
   from the stored preference before the first paint, so the page never flashes the wrong theme.
2. **Sign-in check.** `AuthGate`, in the root layout, shows "Checking sign-in…" while it
   configures Amplify (see [Sign-in](#sign-in)). If the URL carries an OAuth `code` and `state`,
   Amplify completes that redirect first.
3. **Signed out.** The sign-in page renders at whatever URL was opened. Signing in stores that
   path and query in `sessionStorage`, goes to the Cognito hosted UI (Google), and comes back to
   `/orcahouse/`, where `AuthGate` restores the stored path.
4. **Signed in.** The header, side navigation and Apollo provider render, and `useMartSchema`
   sends one introspection query. Apollo caches the result for the life of the page, so every
   component reads the same schema.
5. **The view.** `MartView` reads `?table=`. Without it, the catalogue home page shows; with it,
   `TableBrowser` renders that table. `TableBrowser` is keyed by the table name, so switching
   tables starts with fresh column, search and filter state.

## One static page

- `next build` writes plain HTML, CSS and JS to `out/` (`output: 'export'`) with
  `basePath: '/orcahouse'`, the counterpart of orca-ui-v2's `base: '/v2/'`.
- There is one route. The catalogue is `/orcahouse/` and a table is `/orcahouse/?table=<name>`,
  so one `index.html` serves every URL. That is what the portal's CloudFront rewrite expects,
  and it means tables the build has never seen still open.
- `trailingSlash: true` makes each route export as `<route>/index.html`, which is what the
  rewrite resolves to (see [Deployment](deployment.md)).
- `next dev` keeps its server features for the local API proxy. `.dev.ts` is a page extension
  in development only, so `src/app/api/graphql/route.dev.ts` never reaches the export.

## Which API the app calls

The portal builds this app once and promotes the same artifact from dev to prod, so no API host
is built in. `src/lib/environment.ts` derives it from the hostname the page is served from:

| Hostname                                                                                 | Environment | Mart API                      |
| ---------------------------------------------------------------------------------------- | ----------- | ----------------------------- |
| `portal.umccr.org`, `portal.prod.umccr.org`, `orcaui.umccr.org`, `orcaui.prod.umccr.org` | prod        | `https://mart.prod.umccr.org` |
| `portal.stg.umccr.org`, `orcaui.stg.umccr.org`                                           | stg         | `https://mart.stg.umccr.org`  |
| Anything else                                                                            | dev         | `https://mart.dev.umccr.org`  |

An unrecognised hostname resolves to dev, so a mistake fails towards the non-production API.
Only the prod API exists today, so the dev portal shows an API error. That is deliberate: it is
better than the dev deployment reading production data. Under `next dev` the app calls the local
proxy instead, and `MART_API_URL` decides where the proxy forwards.

## Sign-in

`src/lib/auth.ts` configures Amplify for the Cognito hosted UI with Google federation, as
orca-ui-v2 does, using the authorization code flow and the `openid email profile` scopes.

- **Settings.** Deployed, they come from the portal's runtime config. The app loads
  `/orcahouse/env.js`, which the portal's config Lambda writes into this app's own path and which
  sets `window.config` (`VITE_COG_USER_POOL_ID`, `VITE_COG_APP_CLIENT_ID`, `VITE_OAUTH_DOMAIN`,
  `VITE_REGION`). In development they come from the `NEXT_PUBLIC_COGNITO_*` variables that
  `start.sh` exports. With neither, the sign-in page reports that sign-in is not configured.
- **Shared session.** Deployed, the app uses the portal's app client, so anyone signed in to the
  portal on portal.umccr.org is already signed in here. That client is also the only one the
  mart API's authorizer accepts.
- **Redirects.** Cognito returns to `<current origin>/orcahouse/`. The app derives this at
  runtime instead of reading it from `env.js` or SSM, which both name the portal root, a
  different app. That exact URL must be registered on the Cognito app client (see
  [Deployment](deployment.md#sign-in-redirects)).
- **Tokens.** Amplify keeps the tokens in `localStorage` and refreshes the ID token when it has
  expired. A failed refresh or a sign-out returns the app to the sign-in page.
- **User menu.** The avatar menu shows the ID token's claims (Profile), a freshly refreshed ID
  token and its expiry for GraphiQL or scripts (Token) and the theme setting (Settings), and it
  signs out through the Cognito logout endpoint.

## Calling the mart API

- **Client.** `src/lib/apollo.ts` builds the Apollo Client. Its `HttpLink` resolves the endpoint
  on each request and adds `Authorization: Bearer <ID token>` from Amplify.
- **Deployed**, the browser calls `https://mart.<env>.umccr.org/graphql` directly. The API's CORS
  policy allows the portal origins.
- **In development**, that CORS policy does not allow `localhost`, so requests go to
  `/orcahouse/api/graphql/`, a same-origin proxy (`route.dev.ts`). It forwards the request body
  to `MART_API_URL` with `MART_API_TOKEN`, or with the session's token when that is not set, which
  the API rejects because localhost sign-in uses a different app client. A 401 or 403 comes back
  as a GraphQL error with a readable message, so the UI shows it instead of a network failure.
- **The API** lives in the orcahouse repo under `infra/api`. It is an API Gateway JWT authorizer
  in front of a Lambda that runs PostGraphile v5 over the `mart` schema as a read-only database
  user. It accepts GraphQL over POST only and caps request bodies at 10,000 bytes. Filtering
  comes from the connection-filter plugin, limited to an allowlist: `equalTo`, `notEqualTo`,
  `lessThan`, `lessThanOrEqualTo`, `greaterThan`, `greaterThanOrEqualTo`, `isNull` and
  `includesInsensitive`, combined with `and`, `or` and `not`. It rejects empty filter objects.

## Reading the schema at runtime

PostGraphile generates the API from the `mart` Postgres schema, so tables, columns, filter
operators and sort keys change whenever dbt publishes a model. Instead of generated types, the UI
introspects the live schema on load (`src/lib/schema.ts`) and derives:

| Metadata      | Derived from                                                                                                            | Example for `lims`                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Collections   | Root `Query` fields whose type has a `nodes` field, with the types of their `filter` and `orderBy` arguments            | `allLims`: nodes `Lim`, filter `LimFilter`, sort `LimsOrderBy`     |
| Columns       | Fields of the node type that take no arguments and return a scalar or enum                                              | `libraryId: String`, `sequencingRunDate: Date`                     |
| Filter fields | Fields of the filter input type other than `and`, `or` and `not`, keeping the operators the UI knows (`OPERATOR_ORDER`) | `libraryId`: equals, not equal, contains, greater than, …, is null |
| Sort keys     | Values of the orderBy enum                                                                                              | `SEQUENCING_RUN_DATE_DESC`                                         |

Browsing a new mart table therefore needs no code. The schema is read once per page load, so a
change to the API, such as a newly allowed operator, shows after a reload.

## The catalogue

`src/lib/catalog.ts` lists the dbt mart tables with their group, description, STABLE/DEMO status
and an optional default sort. `resolveCatalog` merges that list with the live collections:

- An entry matches a collection by its `collection` value, or by its table name with the
  pluralisation PostGraphile may apply (`all` + the table name, plus `s` or `es`).
- Catalogued tables the API does not expose stay listed but greyed out, and open to a
  "Not exposed by the API" notice.
- Collections the catalogue does not list appear under "Other", so nothing the API exposes is
  hidden.

The home page lists every group and how many catalogued tables are live.

## The table view

`src/components/TableBrowser.tsx` connects the schema metadata, the URL and the rows query.

### URL state

Everything that decides which rows show lives in the query string, so any view can be shared or
bookmarked. Default values are left out of the URL.

| Parameter | Meaning                                                    | Default                                    |
| --------- | ---------------------------------------------------------- | ------------------------------------------ |
| `table`   | dbt table name                                             | None: the catalogue home page              |
| `page`    | Page number, from 1                                        | `1`                                        |
| `size`    | Rows per page: 10, 25, 50 or 100                           | `25`                                       |
| `sort`    | One orderBy enum value, such as `SEQUENCING_RUN_DATE_DESC` | Set on the first visit (see below)         |
| `filter`  | The advanced filter, as GraphQL filter JSON                | Set on the first visit (see below)         |
| `q`       | Row search text                                            | None                                       |
| `qcol`    | Row search column                                          | `libraryId`, or else the first text column |

For example,
`/orcahouse/?table=lims&sort=SEQUENCING_RUN_DATE_DESC&filter={"and":[{"libraryId":{"equalTo":"L2400001"}}]}`
or `/orcahouse/?table=workflow&q=umccrise&qcol=workflowName`.

Changing the page, page size, sort or filter adds a browser history entry. Search changes
replace the current entry, so typing does not leave one entry per pause.

### First visit

When the URL has neither `sort` nor `filter`, the view sorts newest first and hides rows whose
sort column is null, as the legacy portal did. The sort is the catalogue's `defaultSort` when the
API offers it, or else the first `Date` or `Datetime` column, descending. The filter is
`{"and":[{"<column>":{"isNull":false}}]}`. Both are written to the URL, replacing the current
entry, so they show in the advanced filter and can be removed there.

### The rows query

`src/lib/query-builder.ts` builds one query per table. For `lims` it looks like this:

```graphql
query allLimsRows($first: Int!, $offset: Int!, $orderBy: [LimsOrderBy!], $filter: LimFilter) {
  rows: allLims(first: $first, offset: $offset, orderBy: $orderBy, filter: $filter) {
    totalCount
    nodes {
      sequencingRunId
      sequencingRunDate
      libraryId
      # …every scalar column
    }
  }
}
```

- The connection is aliased to `rows`, so every table shares one result shape.
- Every scalar column is requested whichever ones are shown, so hiding or showing a column never
  refetches. A few dozen column names stay well under the API's 10,000-byte request limit.
- Paging is offset-based: `first` is the page size and `offset` is `(page - 1) × size`.
  `totalCount` gives the number of pages.
- While a new page loads, the previous rows stay on screen, dimmed.

### Row search

The search box above the table finds rows whose value in one text column contains the typed
text, ignoring case. The logic is in `src/lib/row-search.ts` and the box is
`src/components/RowSearch.tsx`.

- **Operator.** The search sends the connection-filter operator `includesInsensitive`, which
  PostGraphile runs as `"column" ILIKE '%text%'`. Any `%` or `_` in the text is escaped, so the
  text always matches literally.
- **Columns.** Only text columns support that operator, so only text columns are offered. The
  search starts on `libraryId` when the table has one, since most mart tables are keyed by
  library, and otherwise on the first text column.
- **When it runs.** 400 ms after typing pauses, or straight away on Enter. Escape or the clear
  button removes the search. Changing the text, or the column while there is text, goes back to
  page 1.
- **URL.** The text is stored as `q` and the column as `qcol`. The box keeps what the user is
  typing while its own URL updates arrive, and it takes the URL's text when the URL changes for
  any other reason, such as the back button.
- **Availability.** If the API does not allow `includesInsensitive`, no column offers it and the
  box is hidden. The advanced filter button still shows.

### Advanced filter

The **Advanced filter** button after the search box opens the filter builder
(`src/components/FilterBuilder.tsx`), for conditions the search cannot express.

- **Closed by default.** The button shows how many conditions are applied, including the
  first-visit filter, so rows hidden by a filter are never a surprise. Closing the panel keeps
  edits that have not been applied yet.
- **Conditions.** Each condition is `column operator value`, and all of them combine with AND or
  all with OR.
- **Operators.** Every filterable column offers equals, not equal, greater than, greater or equal,
  less than, less or equal, and is null / is not null. Text columns also offer contains
  (`includesInsensitive`).
- **Values.** The input follows the column type: a date picker for `Date` and `Datetime`
  (compared in UTC), a number input for numbers, true or false for booleans, and text otherwise.
  Values are converted to the type the API expects before they are sent.
- **Apply and Reset.** Nothing is sent until Apply. Reset removes every condition.
- **URL.** The applied filter is stored in `filter` as the ready-to-send GraphQL filter JSON, the
  same convention the legacy portal used.

### How search and filter combine

The search is kept apart from `filter` and ANDed onto it when the query is sent
(`combineFilters` in `src/lib/filters.ts`). With the first-visit filter and a search for `l24` on
`lims`, the query's `filter` variable is:

```json
{
  "and": [
    { "and": [{ "sequencingRunDate": { "isNull": false } }] },
    { "libraryId": { "includesInsensitive": "l24" } }
  ]
}
```

Missing and empty parts are left out, because the API rejects an empty filter object.

### Sorting, columns, export and cells

- **Sorting.** Column headers with an orderBy enum value are clickable. The first click sorts
  descending and the next ascending. One column sorts at a time, and a new sort goes back to
  page 1.
- **Columns.** The Columns menu hides columns in the browser only. The choice is not in the URL
  and resets when you switch tables.
- **Export CSV.** Downloads the rows on the current page, visible columns only, as RFC 4180 CSV
  with a byte order mark so that Excel reads it as UTF-8. The file is named
  `<table>-page<n>-<yyyy-mm-dd>.csv`.
- **Cells.** Datetimes show without the `T` and fractional seconds, integers use thousands
  separators, JSON values show as text, and nulls show as a faint italic `null`. Headers are
  humanised from the field name, keeping acronyms: `sequencingRunId` becomes "Sequencing Run ID".

## Side navigation

The side navigation lists the catalogue by group. It is hidden on narrow screens.

- **Table search.** Filters the tables as you type (`src/lib/table-search.ts`). Every word must
  match, either fuzzily against the table name (`fqh` finds `fastq_history`, with the matched
  letters highlighted) or, from three characters, within the group name or description. Name
  matches rank first.
- **Folds.** Groups fold. The folds are remembered in `localStorage` and follow other tabs.

## Theme

Light, dark or system, stored in `localStorage`. The head script applies it before the first
paint, and `ThemeSync` keeps it in step with system changes and other tabs. Dark mode is the
`data-theme` attribute on `<html>`, which Tailwind's `dark:` variant follows.
