#!/bin/zsh
# Eye colour sync with stored layers, against the REAL liforma-staging bucket, read back from staging-cdn.
# Rows are written to the LOCAL database copy (scratchpad/api-stored-eyes .env -> localhost:51222); the staging rows are
# updated separately with SQL in Supabase. Pass --apply to write files; without it this is a dry run.
set -e
API=/private/tmp/claude-501/-Users-saizalpreetkaur--Desktop-Liforma-LTD/64a8ea51-edd8-4d54-afaf-a5ce2fdade01/scratchpad/api-stored-eyes
REAL_ENV=/Users/saizalpreetkaur./Desktop/Liforma_LTD/NEW/liforma/api.liforma.ai/.env
cd "$API"
set -a
. ./.env
set +a
# Real R2 endpoint, keys and bucket from the main api checkout (never printed).
for key in S3_API_URL S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_BUCKET; do
	value=$(sed -n "s/^${key}=//p" "$REAL_ENV" | head -1 | sed -e 's/^"//' -e 's/"$//')
	export "$key=$value"
done
export PUBLIC_CDN_BASE_URL=https://staging-cdn.liforma.ai
case "$S3_API_URL" in *r2.cloudflarestorage.com*) ;; *) echo "S3_API_URL is not the real R2 endpoint; stopping." >&2; exit 2;; esac
[ "$S3_BUCKET" = "liforma-staging" ] || { echo "S3_BUCKET is not liforma-staging; stopping." >&2; exit 2; }
case "$DATABASE_URL" in *localhost:51222*) ;; *) echo "DATABASE_URL is not the local copy; stopping." >&2; exit 2;; esac
echo "bucket=$S3_BUCKET endpoint=r2 cdn=$PUBLIC_CDN_BASE_URL db=local:51222 args=$*"
exec node --import ./scripts/sveltekit-env-register.mjs --import tsx scripts/sync-eye-colour-library.ts --cdn https://staging-cdn.liforma.ai --store-layers "$@"
