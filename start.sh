#!/usr/bin/env source
# -*- coding: utf-8 -*-
# This wrapper script is for local development only, following orca-ui-v2's start.sh.
#
# Sourcing this script will:
#   1. get the Cognito sign-in settings from SSM Parameter Store
#   2. export them as NEXT_PUBLIC_* environment variables
#   3. start the Next.js development server
#
# REQUIRED CLI:
# aws
#
# USAGE:
# Typically (recommended) through make, which also sets MART_API_URL and MART_API_TOKEN:
#     make start
#     make start MART_API_TOKEN=eyJ...
#
# Otherwise source it standalone, from bash or zsh:
#     source start.sh
#     source start.sh unset
#
# CAVEATS:
# The settings come from the dev account, which is enough to sign in locally:
#     aws sso login --profile dev && export AWS_PROFILE=dev
# The mart API is only deployed to prod and rejects those sign-in tokens, so pass your own
# token for API calls with MART_API_TOKEN (see the Makefile).
# Open http://localhost:3000/mart/ (the app's base path). Cognito's localhost app client
# accepts only http://localhost:3000 as its callback, so sign-in needs the default port.
# PORT still overrides it, e.g. `PORT=3001 pnpm start`.

# Exports made by a child process vanish with it, so refuse to be executed. Uses return-safe
# checks: `exit` in a sourced script would close the calling shell.
if [ -n "${ZSH_EVAL_CONTEXT:-}" ]; then
  case "$ZSH_EVAL_CONTEXT" in
    *:file*) ;;
    *)
      echo "YOU SHOULD SOURCE THIS SCRIPT, NOT EXECUTE IT!"
      exit 1
      ;;
  esac
elif [ "${BASH_SOURCE[0]:-}" = "$0" ]; then
  echo "YOU SHOULD SOURCE THIS SCRIPT, NOT EXECUTE IT!"
  exit 1
fi

if [ "${1:-}" = "unset" ]; then
  unset NEXT_PUBLIC_COGNITO_REGION
  unset NEXT_PUBLIC_COGNITO_USER_POOL_ID
  unset NEXT_PUBLIC_COGNITO_APP_CLIENT_ID
  unset NEXT_PUBLIC_COGNITO_OAUTH_DOMAIN
  unset NEXT_PUBLIC_OAUTH_REDIRECT_SIGN_IN
  unset NEXT_PUBLIC_OAUTH_REDIRECT_SIGN_OUT
  echo "UNSET NEXT_PUBLIC_* COGNITO ENV VARS"
  return 0
fi

command -v aws >/dev/null 2>&1 || {
  echo >&2 "AWS CLI COMMAND NOT FOUND. ABORTING..."
  return 1
}

cognito_region=ap-southeast-2

cog_user_pool_id=$(aws ssm get-parameter --region "$cognito_region" --name '/data_portal/client/cog_user_pool_id' --query Parameter.Value --output text)
if [ -z "$cog_user_pool_id" ]; then
  echo >&2 "Halt, No valid AWS login session found. Please 'aws sso login --profile dev && export AWS_PROFILE=dev'"
  return 1
fi
oauth_domain=$(aws ssm get-parameter --region "$cognito_region" --name '/data_portal/client/oauth_domain' --query Parameter.Value --output text)
# The same localhost app client parameters as orca-ui-v2. The Cognito stack also publishes them
# under /cognito/localhost-app/ and marks these names deprecated.
cog_app_client_id_local=$(aws ssm get-parameter --region "$cognito_region" --name '/data_portal/client/cog_app_client_id_local' --query Parameter.Value --output text)
oauth_redirect_in_local=$(aws ssm get-parameter --region "$cognito_region" --name '/data_portal/client/oauth_redirect_in_local' --query Parameter.Value --output text)
oauth_redirect_out_local=$(aws ssm get-parameter --region "$cognito_region" --name '/data_portal/client/oauth_redirect_out_local' --query Parameter.Value --output text)

if [ -z "$oauth_domain" ] || [ -z "$cog_app_client_id_local" ] || [ -z "$oauth_redirect_in_local" ] || [ -z "$oauth_redirect_out_local" ]; then
  echo >&2 "Halt, could not read every Cognito setting from SSM (see the errors above)."
  return 1
fi

export NEXT_PUBLIC_COGNITO_REGION=$cognito_region
export NEXT_PUBLIC_COGNITO_USER_POOL_ID=$cog_user_pool_id
export NEXT_PUBLIC_COGNITO_OAUTH_DOMAIN=$oauth_domain
export NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=$cog_app_client_id_local
export NEXT_PUBLIC_OAUTH_REDIRECT_SIGN_IN=$oauth_redirect_in_local
export NEXT_PUBLIC_OAUTH_REDIRECT_SIGN_OUT=$oauth_redirect_out_local

env | grep NEXT_PUBLIC_

pnpm exec next dev --port "${PORT:-3000}"
