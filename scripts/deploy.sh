#!/bin/sh
set -e

# Deploy to blockout.aroundtableround.com.
#
# Two syncs on purpose. Everything Vite emits is fingerprinted, so it can be
# cached forever - but the service worker, the page that loads it and the
# manifest are fixed filenames, and if CloudFront held those for its default
# day, an installed copy would keep booting the old build long after a deploy.
# They go up with no-cache so the update check actually reaches the origin.

BUCKET=s3://aroundtableround-3dblock
DISTRIBUTION=E26TGWNT5TCXV1
PROFILE=personal-deploy
ENTRY="index.html sw.js registerSW.js manifest.webmanifest"

includes=""
excludes=""
for f in $ENTRY; do
  includes="$includes --include $f"
  excludes="$excludes --exclude $f"
done

# 1. Fingerprinted assets: immutable. --delete because hashed filenames would
#    otherwise leave every previous build's bundle in the bucket forever.
# shellcheck disable=SC2086
aws s3 sync dist/ "$BUCKET" --delete --profile "$PROFILE" \
  --cache-control 'public,max-age=31536000,immutable' $excludes

# 2. The fixed-name entry points: never cached.
# shellcheck disable=SC2086
aws s3 sync dist/ "$BUCKET" --profile "$PROFILE" \
  --cache-control 'no-cache' --exclude '*' $includes

aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" \
  --paths '/*' --profile "$PROFILE" > invalidation_output.txt

echo "deployed: https://blockout.aroundtableround.com/"
