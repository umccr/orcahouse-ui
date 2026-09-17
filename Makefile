# The mart API is only deployed to prod.
# Local development only: the deployed app derives the mart host from its own hostname
# (src/lib/environment.ts), so this is never built into the artifact.
MART_API_URL ?= https://mart.prod.umccr.org
export MART_API_URL

# Local development only: your own token for mart API calls, such as the ID token from
# portal.umccr.org (profile menu > Token), e.g. `make start MART_API_TOKEN=eyJ...`.
MART_API_TOKEN ?=
export MART_API_TOKEN

install:
	@pre-commit install
	@pnpm install --frozen-lockfile

check: install
	@pre-commit run --all-files

format:
	@pnpm format

baseline:
	@detect-secrets scan --exclude-files '^(node_modules/|\.next/|pnpm-lock\.yaml$$)' > .secrets.baseline

# Dev server with the Cognito sign-in settings from SSM (see start.sh). Needs an AWS session for dev.
start:
	@pnpm start

dev:
	@pnpm dev

# Static export to out/, served from the orcahouse UI bucket at portal.umccr.org/orcahouse/ (see README).
build:
	@pnpm build
