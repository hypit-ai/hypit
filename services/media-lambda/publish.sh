#!/usr/bin/env bash
# Publish one immutable managed-runtime ZIP of the media function.
#
# FFmpeg is a separate, immutable Layer. This script never builds an image,
# creates an ECR repository or guesses which Layer an account should trust.
set -euo pipefail

: "${AWS_REGION:?set AWS_REGION, e.g. us-east-1}"
: "${AWS_ACCOUNT_ID:?set AWS_ACCOUNT_ID, your 12-digit account id}"
: "${NARRATAGE_MEDIA_BUCKET:?set NARRATAGE_MEDIA_BUCKET, the ArtifactStore bucket the function shares}"
: "${NARRATAGE_FFMPEG_LAYER_ARN:?set NARRATAGE_FFMPEG_LAYER_ARN to an immutable layer version ARN}"

FUNCTION="${NARRATAGE_MEDIA_FUNCTION:-narratage-media-zip}"
ROLE="${NARRATAGE_MEDIA_ROLE:-NarratageMediaExecution}"
MEMORY="${NARRATAGE_MEDIA_MEMORY:-3008}"
TIMEOUT="${NARRATAGE_MEDIA_TIMEOUT:-900}"
EPHEMERAL="${NARRATAGE_MEDIA_EPHEMERAL:-8192}"
FFMPEG_VERSION="8.0.1"

here="$(cd "$(dirname "$0")" && pwd)"
layer="$NARRATAGE_FFMPEG_LAYER_ARN"
if [[ ! "$layer" =~ ^arn:aws[a-zA-Z-]*:lambda:([a-z0-9-]+):([0-9]{12}):layer:[A-Za-z0-9-_]+:([0-9]+)$ ]]; then
  printf 'NARRATAGE_FFMPEG_LAYER_ARN must name an immutable Layer version; got %s\n' "$layer" >&2
  exit 2
fi
if [ "${BASH_REMATCH[1]}" != "$AWS_REGION" ]; then
  printf 'FFmpeg Layer belongs to region %s, not configured region %s\n' \
    "${BASH_REMATCH[1]}" "$AWS_REGION" >&2
  exit 2
fi

printf 'Bundling managed-runtime function ZIP\n'
(cd "$here" && node build.mjs >/dev/null)
hash="$(tr -d '\n' < "$here/build/bundle-hash.txt")"
runtime="$(node -p "require('$here/build/deployment.json').runtime")"
architecture="$(node -p "require('$here/build/deployment.json').architecture")"
handler="$(node -p "require('$here/build/deployment.json').handler")"
archive="$here/build/function.zip"

# Resolve the exact Layer before mutating the function. The ARN is immutable;
# runtime validation then proves that /opt/bin really contains the promised
# pair rather than trusting its name.
aws lambda get-layer-version-by-arn --region "$AWS_REGION" --arn "$layer" >/dev/null

node -e 'const fs=require("node:fs");fs.writeFileSync(process.argv[1],JSON.stringify({Variables:{NARRATAGE_MEDIA_BUNDLE_HASH:process.argv[2],NARRATAGE_FFMPEG_VERSION:process.argv[3],FFMPEG_PATH:"/opt/bin/ffmpeg",FFPROBE_PATH:"/opt/bin/ffprobe"}}))' \
  "$here/build/environment.json" "$hash" "$FFMPEG_VERSION"

printf 'Publishing bundle %s with Layer %s\n' "$hash" "$layer"
if aws lambda get-function --region "$AWS_REGION" --function-name "$FUNCTION" >/dev/null 2>&1; then
  package_type="$(aws lambda get-function-configuration --region "$AWS_REGION" \
    --function-name "$FUNCTION" --query PackageType --output text)"
  if [ "$package_type" != Zip ]; then
    printf '%s is a %s function; AWS cannot change package type. Set NARRATAGE_MEDIA_FUNCTION to a new name.\n' \
      "$FUNCTION" "$package_type" >&2
    exit 2
  fi
  aws lambda update-function-code --region "$AWS_REGION" --function-name "$FUNCTION" \
    --zip-file "fileb://$archive" --architectures "$architecture" >/dev/null
  aws lambda wait function-updated-v2 --region "$AWS_REGION" --function-name "$FUNCTION"
  aws lambda update-function-configuration --region "$AWS_REGION" --function-name "$FUNCTION" \
    --role "arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE}" \
    --runtime "$runtime" --handler "$handler" --layers "$layer" \
    --memory-size "$MEMORY" --timeout "$TIMEOUT" \
    --ephemeral-storage "Size=${EPHEMERAL}" \
    --environment "file://$here/build/environment.json" >/dev/null
  aws lambda wait function-updated-v2 --region "$AWS_REGION" --function-name "$FUNCTION"
else
  aws lambda create-function --region "$AWS_REGION" --function-name "$FUNCTION" \
    --runtime "$runtime" --handler "$handler" \
    --zip-file "fileb://$archive" \
    --role "arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE}" \
    --architectures "$architecture" --layers "$layer" \
    --memory-size "$MEMORY" --timeout "$TIMEOUT" \
    --ephemeral-storage "Size=${EPHEMERAL}" \
    --environment "file://$here/build/environment.json" >/dev/null
  aws lambda wait function-active-v2 --region "$AWS_REGION" --function-name "$FUNCTION"
fi

read -r actual_runtime actual_handler actual_architecture actual_layer layer_count actual_hash actual_ffmpeg package_type < <(
  aws lambda get-function-configuration --region "$AWS_REGION" --function-name "$FUNCTION" \
    --query '[Runtime,Handler,Architectures[0],Layers[0].Arn,length(Layers),Environment.Variables.NARRATAGE_MEDIA_BUNDLE_HASH,Environment.Variables.NARRATAGE_FFMPEG_VERSION,PackageType]' \
    --output text
)
if [ "$actual_runtime" != "$runtime" ] || [ "$actual_handler" != "$handler" ] \
  || [ "$actual_architecture" != "$architecture" ] || [ "$actual_layer" != "$layer" ] \
  || [ "$layer_count" != 1 ] || [ "$actual_hash" != "$hash" ] \
  || [ "$actual_ffmpeg" != "$FFMPEG_VERSION" ] || [ "$package_type" != Zip ]; then
  printf 'published function configuration does not match the reviewed deployment\n' >&2
  exit 1
fi

# A version, not $LATEST. The Provider refuses an unqualified ARN.
version="$(aws lambda publish-version --region "$AWS_REGION" --function-name "$FUNCTION" \
  --description "bundle ${hash}; ffmpeg layer ${layer}" --query Version --output text)"
arn="arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:${FUNCTION}:${version}"

cat <<JSON

Published. Add this to the endpoints of your Runtime Profile:

  {
    "use": "@narratage/provider-media-aws-lambda",
    "instance": "media.aws-lambda",
    "lane": "media",
    "config": {
      "functionArn": "${arn}",
      "bucket": "${NARRATAGE_MEDIA_BUCKET}"
    }
  }

JSON
