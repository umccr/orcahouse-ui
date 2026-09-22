# Local development

How to run OrcaHouse UI on your machine against the mart API. For how the pieces fit together,
see [How it works](how-it-works.md).

## Prerequisites

| Tool           | Version                                                     | Used for                                      |
| -------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Node.js        | 24 (see `.nvmrc`)                                           | Next.js                                       |
| pnpm           | 10; `corepack enable` picks the version from `package.json` | Dependencies and scripts                      |
| AWS CLI        | v2, with SSO access to the dev account                      | Reading the Cognito sign-in settings from SSM |
| pre-commit     | Any recent version (`brew install pre-commit`)              | `make install` and `make check`               |
| detect-secrets | Optional (`brew install detect-secrets`)                    | `make baseline` only                          |

You also need a UMCCR Google account to sign in, and access to <https://portal.umccr.org> to
copy a token for the mart API.

## Start the dev server

```sh
make install                                       # pre-commit hooks and pinned dependencies
aws sso login --profile dev && export AWS_PROFILE=dev
make start MART_API_TOKEN=<your ID token from portal.umccr.org>
```

Then open <http://localhost:3000/orcahouse/> (the root `/` redirects there) and sign in with your
UMCCR Google account.

`make start` sources `start.sh`, the same wrapper orca-ui-v2 uses. It reads the Cognito sign-in
settings for the localhost app client from SSM Parameter Store in the dev account, exports them
as `NEXT_PUBLIC_*` variables and starts `next dev` on port 3000.

## The mart API token

The mart API is only deployed to prod, so the Makefile points `MART_API_URL` at
<https://mart.prod.umccr.org>. Its authorizer only accepts tokens from the portal's app client,
not the localhost app client you sign in with here. In development the dev proxy therefore
sends your own token instead:

1. Sign in to <https://portal.umccr.org>.
2. Open the profile menu, choose **Token**, and copy the ID token.
3. Pass it as `MART_API_TOKEN`, either on the command line as above or by exporting it once per
   shell: `export MART_API_TOKEN=eyJ...` and then `make start`.

Portal ID tokens last up to a day. When API calls fail with "The mart API rejected
MART_API_TOKEN", restart with a fresh one.

Do not paste the token into the Makefile's `MART_API_TOKEN ?=` line: the next `git add` would
commit it. The detect-secrets hook is there to catch that, but the command line or a shell
export keeps it out of the repository entirely.

The static build has no proxy, so it never uses `MART_API_TOKEN`.

## Port and sign-in

The dev server must stay on port 3000, the only callback URL registered on the Cognito localhost
app client. `PORT` still overrides it (`PORT=3001 make start`), but sign-in then fails.

`make dev` starts the server without the Cognito settings, so the sign-in page only reports that
sign-in is not configured. It is useful for work on the sign-in page itself.

The OAuth redirect URLs are derived rather than read from SSM, because the SSM parameters name
the portal root, a different app. `src/lib/auth.ts` uses the current origin plus the base path,
so local sign-in returns to <http://localhost:3000/orcahouse/>. That URL is registered on the
localhost app client by the `cognito_aai` Terraform stack.

## Environment variables

| Variable                              | Set by                                                          | Purpose                                                 |
| ------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID`    | `start.sh`, from `/data_portal/client/cog_user_pool_id`         | Cognito user pool                                       |
| `NEXT_PUBLIC_COGNITO_OAUTH_DOMAIN`    | `start.sh`, from `/data_portal/client/oauth_domain`             | Hosted UI domain prefix (a full host name also works)   |
| `NEXT_PUBLIC_COGNITO_APP_CLIENT_ID`   | `start.sh`, from `/data_portal/client/cog_app_client_id_local`  | Localhost app client                                    |
| `NEXT_PUBLIC_OAUTH_REDIRECT_SIGN_IN`  | `start.sh`, from `/data_portal/client/oauth_redirect_in_local`  | Unused: the app derives its own redirect                |
| `NEXT_PUBLIC_OAUTH_REDIRECT_SIGN_OUT` | `start.sh`, from `/data_portal/client/oauth_redirect_out_local` | Unused: the app derives its own redirect                |
| `NEXT_PUBLIC_COGNITO_REGION`          | `start.sh` (`ap-southeast-2`)                                   | Region of the user pool                                 |
| `MART_API_URL`                        | Makefile, default `https://mart.prod.umccr.org`                 | Local development only: upstream for the dev proxy      |
| `MART_API_TOKEN`                      | You, for example `make start MART_API_TOKEN=...`                | Local development only: bearer token for mart API calls |

`source start.sh unset` clears the `NEXT_PUBLIC_*` variables from your shell.

The deployed app uses none of these. It reads the Cognito settings from the portal's `env.js`
and derives the mart API host from its own hostname, so nothing environment-specific is baked
into the build.

## Using another API

`MART_API_URL` is only read by the dev proxy, so the UI can point at any PostGraphile server with
the same schema, for example to try an API change before it is deployed:

```sh
make start MART_API_URL=http://localhost:5055
```

The proxy still sends `MART_API_TOKEN`; a local server without an authorizer ignores it. The API
server in the orcahouse repo (`infra/api/lambda-server`) runs locally with `pnpm start`, reading
`DATABASE_URL` and `SCHEMA_NAME=mart`. It listens on port 5000, which macOS often reserves for
AirPlay Receiver.

## Before you push

```sh
make check      # every pre-commit hook: ESLint, Prettier, secret and file checks
pnpm build      # the static export, as the pipeline builds it
```

Pull requests run the same hooks plus a type check and a production build.

## Troubleshooting

| Symptom                                                    | Cause                                                                          | Fix                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `make start` stops with "No valid AWS login session found" | No AWS session for the dev account                                             | `aws sso login --profile dev && export AWS_PROFILE=dev`                                       |
| The sign-in page says sign-in is not configured            | Started with `make dev`, or `start.sh` could not read SSM                      | Use `make start` and check its output for SSM errors                                          |
| The hosted UI shows `redirect_mismatch`                    | The dev server is not on port 3000                                             | Stop whatever holds port 3000 and restart on it                                               |
| Tables show "The mart API rejected MART_API_TOKEN (401)"   | The token has expired or was copied incompletely                               | Copy a fresh ID token from portal.umccr.org and restart                                       |
| Tables show "The mart API rejected the sign-in token"      | `MART_API_TOKEN` is not set                                                    | Pass `MART_API_TOKEN` to `make start`                                                         |
| No search box above a table                                | The API does not allow `includesInsensitive`, or the table has no text columns | Check the API's allowed operators (see [Deployment](deployment.md#the-mart-api)), then reload |
| A table opens to "Not exposed by the API"                  | The catalogue lists a table the live schema does not have                      | Nothing to fix in the UI: the table is not deployed in the `mart` schema yet                  |
