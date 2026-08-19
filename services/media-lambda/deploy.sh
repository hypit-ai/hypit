#!/usr/bin/env bash
# Plan or apply the complete, long-lived Media Lambda CloudFormation stack.
set -euo pipefail

operation="${1:-}"
if [ "$operation" != plan ] && [ "$operation" != apply ]; then
  printf 'usage: %s plan | %s apply <change-set-arn>\n' "$0" "$0" >&2
  exit 2
fi

: "${AWS_REGION:?set AWS_REGION, e.g. us-east-1}"
: "${AWS_ACCOUNT_ID:?set AWS_ACCOUNT_ID, your 12-digit account id}"
: "${HYPIT_MEDIA_ENVIRONMENT:?set HYPIT_MEDIA_ENVIRONMENT, e.g. dev}"
: "${HYPIT_MEDIA_STACK:?set HYPIT_MEDIA_STACK, e.g. hypit-media-dev}"

here="$(cd "$(dirname "$0")" && pwd)"
caller_account="$(aws sts get-caller-identity --query Account --output text)"
if [ "$caller_account" != "$AWS_ACCOUNT_ID" ]; then
  printf 'AWS credential chain resolves account %s, not configured account %s\n' \
    "$caller_account" "$AWS_ACCOUNT_ID" >&2
  exit 2
fi

if [ "$operation" = apply ]; then
  change_set="${2:?apply requires the exact change-set ARN printed by plan}"
  stack="$(aws cloudformation describe-change-set --region "$AWS_REGION" \
    --change-set-name "$change_set" --query StackName --output text)"
  if [ "$stack" != "$HYPIT_MEDIA_STACK" ]; then
    printf 'change set belongs to %s, not configured stack %s\n' "$stack" "$HYPIT_MEDIA_STACK" >&2
    exit 2
  fi
  stack_status="$(aws cloudformation describe-stacks --region "$AWS_REGION" \
    --stack-name "$stack" --query 'Stacks[0].StackStatus' --output text)"
  aws cloudformation execute-change-set --region "$AWS_REGION" --change-set-name "$change_set"
  if [ "$stack_status" = REVIEW_IN_PROGRESS ]; then
    aws cloudformation wait stack-create-complete --region "$AWS_REGION" --stack-name "$stack"
  else
    aws cloudformation wait stack-update-complete --region "$AWS_REGION" --stack-name "$stack"
  fi
  aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$stack" \
    --query 'Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}' --output table
  exit 0
fi

: "${HYPIT_MEDIA_ARTIFACT_BUCKET:?set HYPIT_MEDIA_ARTIFACT_BUCKET}"
: "${HYPIT_MEDIA_DEPLOYMENT_BUCKET:?set HYPIT_MEDIA_DEPLOYMENT_BUCKET}"
: "${HYPIT_MEDIA_FUNCTION:?set HYPIT_MEDIA_FUNCTION}"
: "${HYPIT_MEDIA_ROLE:?set HYPIT_MEDIA_ROLE}"
: "${HYPIT_MEDIA_LAYER:?set HYPIT_MEDIA_LAYER}"

memory="${HYPIT_MEDIA_MEMORY:-3008}"
ephemeral="${HYPIT_MEDIA_EPHEMERAL:-8192}"
concurrency="${HYPIT_MEDIA_CONCURRENCY:-8}"
retention="${HYPIT_MEDIA_LOG_RETENTION_DAYS:-14}"

printf 'Building immutable function and FFmpeg Layer artifacts\n'
(cd "$here" && node build.mjs)
(cd "$here" && node build-layer.mjs)

function_hash="$(node -p "require('$here/build/function-artifact.json').archiveSha256")"
function_code_sha="$(node -p "require('$here/build/function-artifact.json').codeSha256")"
bundle_hash="$(node -p "require('$here/build/function-artifact.json').bundleHash")"
layer_hash="$(node -p "require('$here/build/ffmpeg-layer-artifact.json').archiveSha256")"
function_key="hypit/media-lambda/functions/${function_hash}.zip"
layer_key="hypit/media-lambda/layers/${layer_hash}.zip"

uncompressed_layer="$(node -p "require('$here/build/ffmpeg-layer-artifact.json').uncompressedBytes")"
uncompressed_function="$(unzip -l "$here/build/function.zip" | awk 'END {print $1}')"
if [ "$((uncompressed_layer + uncompressed_function))" -ge 262144000 ]; then
  printf 'function plus Layer exceed Lambda uncompressed ZIP quota\n' >&2
  exit 1
fi

printf 'Uploading content-addressed deployment artifacts\n'
aws s3 cp "$here/build/function.zip" \
  "s3://${HYPIT_MEDIA_DEPLOYMENT_BUCKET}/${function_key}" \
  --region "$AWS_REGION" --only-show-errors --checksum-algorithm SHA256
aws s3 cp "$here/build/ffmpeg-layer.zip" \
  "s3://${HYPIT_MEDIA_DEPLOYMENT_BUCKET}/${layer_key}" \
  --region "$AWS_REGION" --only-show-errors --checksum-algorithm SHA256

stack_status="$(aws cloudformation describe-stacks --region "$AWS_REGION" \
  --stack-name "$HYPIT_MEDIA_STACK" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true)"
if [ -z "$stack_status" ] || [ "$stack_status" = REVIEW_IN_PROGRESS ]; then
  change_set_type=CREATE
else
  change_set_type=UPDATE
fi
change_set_name="media-$(date -u +%Y%m%dT%H%M%SZ)-${function_hash:0:8}-${layer_hash:0:8}"

printf 'Creating unexecuted %s Change Set %s\n' "$change_set_type" "$change_set_name"
change_set_arn="$(aws cloudformation create-change-set --region "$AWS_REGION" \
  --stack-name "$HYPIT_MEDIA_STACK" \
  --change-set-name "$change_set_name" \
  --change-set-type "$change_set_type" \
  --description "Hypit media function ${function_hash}; layer ${layer_hash}" \
  --template-body "file://${here}/template.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
    "ParameterKey=EnvironmentName,ParameterValue=${HYPIT_MEDIA_ENVIRONMENT}" \
    "ParameterKey=FunctionName,ParameterValue=${HYPIT_MEDIA_FUNCTION}" \
    "ParameterKey=ExecutionRoleName,ParameterValue=${HYPIT_MEDIA_ROLE}" \
    "ParameterKey=LayerName,ParameterValue=${HYPIT_MEDIA_LAYER}" \
    "ParameterKey=ArtifactBucket,ParameterValue=${HYPIT_MEDIA_ARTIFACT_BUCKET}" \
    "ParameterKey=DeploymentBucket,ParameterValue=${HYPIT_MEDIA_DEPLOYMENT_BUCKET}" \
    "ParameterKey=FunctionCodeKey,ParameterValue=${function_key}" \
    "ParameterKey=FunctionCodeSha256,ParameterValue=${function_code_sha}" \
    "ParameterKey=FunctionBundleHash,ParameterValue=${bundle_hash}" \
    "ParameterKey=LayerCodeKey,ParameterValue=${layer_key}" \
    "ParameterKey=LayerArchiveHash,ParameterValue=${layer_hash}" \
    "ParameterKey=MemorySize,ParameterValue=${memory}" \
    "ParameterKey=EphemeralStorageSize,ParameterValue=${ephemeral}" \
    "ParameterKey=ReservedConcurrency,ParameterValue=${concurrency}" \
    "ParameterKey=LogRetentionDays,ParameterValue=${retention}" \
    --query Id --output text)"
printf 'Created %s\n' "$change_set_arn"

if ! aws cloudformation wait change-set-create-complete --region "$AWS_REGION" \
  --change-set-name "$change_set_arn"; then
  aws cloudformation describe-change-set --region "$AWS_REGION" \
    --change-set-name "$change_set_arn" \
    --query '{Status:Status,Reason:StatusReason}' --output json >&2
  exit 1
fi

aws cloudformation describe-change-set --region "$AWS_REGION" \
  --change-set-name "$change_set_arn" \
  --query '{Stack:StackName,Status:Status,ExecutionStatus:ExecutionStatus,Changes:Changes[].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType,Replacement:Replacement}}' \
  --output json
printf '\nReview the change set above, then apply exactly:\n\n'
printf '  %q apply %q\n' "$0" "$change_set_arn"
