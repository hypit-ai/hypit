#!/usr/bin/env bash
# Build, push and publish one immutable version of the media function.
#
# Every value below is read from the environment with no default that could
# reach someone else's account. Run it once per deployment; the ARN it prints
# is what a Runtime Profile names.
set -euo pipefail

: "${AWS_REGION:?set AWS_REGION, e.g. us-east-1}"
: "${AWS_ACCOUNT_ID:?set AWS_ACCOUNT_ID, your 12-digit account id}"
: "${NARRATAGE_MEDIA_BUCKET:?set NARRATAGE_MEDIA_BUCKET, the ArtifactStore bucket the function shares}"
REPOSITORY="${NARRATAGE_MEDIA_REPOSITORY:-narratage-media}"
FUNCTION="${NARRATAGE_MEDIA_FUNCTION:-narratage-media}"
ROLE="${NARRATAGE_MEDIA_ROLE:-NarratageMediaExecution}"
MEMORY="${NARRATAGE_MEDIA_MEMORY:-3008}"
TIMEOUT="${NARRATAGE_MEDIA_TIMEOUT:-900}"
EPHEMERAL="${NARRATAGE_MEDIA_EPHEMERAL:-8192}"

here="$(cd "$(dirname "$0")" && pwd)"
registry="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "==> bundling"
(cd "$here" && node build.mjs >/dev/null)
hash="$(cat "$here/build/bundle-hash.txt")"
tag="bundle-${hash}"
echo "    bundle ${hash}"

echo "==> ensuring the ECR repository exists with immutable tags"
aws ecr describe-repositories --region "$AWS_REGION" --repository-names "$REPOSITORY" >/dev/null 2>&1 \
  || aws ecr create-repository --region "$AWS_REGION" --repository-name "$REPOSITORY" \
       --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true >/dev/null

echo "==> building and pushing ${registry}/${REPOSITORY}:${tag}"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$registry" >/dev/null
# Lambda runs x86_64 here; the image must match whatever --architectures says.
docker buildx build --platform linux/amd64 --provenance=false \
  -t "${registry}/${REPOSITORY}:${tag}" "$here/build" --push

digest="$(aws ecr describe-images --region "$AWS_REGION" --repository-name "$REPOSITORY" \
  --image-ids imageTag="$tag" --query 'imageDetails[0].imageDigest' --output text)"
image="${registry}/${REPOSITORY}@${digest}"
echo "    image ${digest}"

echo "==> creating or updating the function"
if aws lambda get-function --region "$AWS_REGION" --function-name "$FUNCTION" >/dev/null 2>&1; then
  aws lambda update-function-code --region "$AWS_REGION" --function-name "$FUNCTION" \
    --image-uri "$image" >/dev/null
  aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION"
  aws lambda update-function-configuration --region "$AWS_REGION" --function-name "$FUNCTION" \
    --memory-size "$MEMORY" --timeout "$TIMEOUT" \
    --ephemeral-storage "Size=${EPHEMERAL}" \
    --environment "Variables={NARRATAGE_MEDIA_BUNDLE_HASH=${hash}}" >/dev/null
  aws lambda wait function-updated --region "$AWS_REGION" --function-name "$FUNCTION"
else
  aws lambda create-function --region "$AWS_REGION" --function-name "$FUNCTION" \
    --package-type Image --code "ImageUri=${image}" \
    --role "arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE}" \
    --architectures x86_64 --memory-size "$MEMORY" --timeout "$TIMEOUT" \
    --ephemeral-storage "Size=${EPHEMERAL}" \
    --environment "Variables={NARRATAGE_MEDIA_BUNDLE_HASH=${hash}}" >/dev/null
  aws lambda wait function-active --region "$AWS_REGION" --function-name "$FUNCTION"
fi

# A version, not $LATEST. The Provider refuses an unqualified ARN, because a
# bare name is whatever was deployed last and two Builds of one Run Source
# could then execute different code under one Endpoint identity.
version="$(aws lambda publish-version --region "$AWS_REGION" --function-name "$FUNCTION" \
  --description "bundle ${hash}" --query 'Version' --output text)"
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
