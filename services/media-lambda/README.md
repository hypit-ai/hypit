# Narratage media execution service

This service answers the five media Needs — inspect, normalize, speech-evidence projection,
timeline audio and mux — in AWS Lambda. It is deployment state, not an author-importable SVML
package.

It owns no media semantics. `@narratage/media-execution` contains the FFmpeg commands and
frame/sample arithmetic shared with `@narratage/provider-media-local`. This directory contributes
an S3 byte gateway, a managed-runtime handler and one declarative AWS deployment.

## One stack, two immutable code objects

`template.yaml` makes one CloudFormation stack own:

- the narrowly scoped Lambda execution role;
- its retained CloudWatch log group;
- an immutable FFmpeg 8.0.1 Layer version;
- the Node.js 22 media function;
- a retained, immutable function version;
- an explicit reserved-concurrency ceiling.

The ArtifactStore bucket and deployment-artifact bucket remain external resources. The same
ArtifactStore can serve local and Lambda Endpoints; the deployment bucket contains code, not Build
Artifacts.

`build.mjs` produces the small function ZIP. `build-layer.mjs` downloads one exact BtbN archive,
checks its SHA-256, retains only `ffmpeg`, `ffprobe`, their shared libraries and the upstream
license, and creates a deterministic Layer ZIP. The Layer provenance is embedded as
`/opt/narratage-layer.json`. Set `NARRATAGE_FFMPEG_SOURCE` to an already downloaded archive for an
offline build; it is accepted only when its digest matches the pin.

Shared-library links are copied verbatim from the upstream archive. The builder rejects absolute,
escaping or dangling links before producing the ZIP, so a build-machine path cannot become a
silent `/opt/lib` runtime failure.

The selected build is:

```text
FFmpeg n8.0.1-66-g27b8d1a017
linux64 GPL shared, x86-64
source sha256 38f5363bef58d74547e5055846d76d8b20bb2872a87b0aab71611b010b437a6f
```

AWS mounts Layer `bin/` and `lib/` as `/opt/bin` and `/opt/lib`. The handler additionally executes
both binaries with `-version` once per warm environment and refuses work unless both report 8.0.1.

## Authority and bytes

The function role can only read and write objects in the selected ArtifactStore bucket and append
to its own log group. It cannot deploy code, publish Layers, inspect IAM or access the deployment
bucket.

The deployer needs the reviewed actions in `iam/publisher.json`. CloudFormation uses the deployer's
AWS credential chain; access keys never enter source, a Runtime Profile or BuildState.

Media bytes never enter the synchronous Lambda request. Requests identify content-addressed S3
objects and results are written back through the same `@narratage/artifact-store-s3` key rule.

## Build without AWS

```bash
pnpm build:media-lambda
pnpm build:media-lambda-layer
```

Ignored output is written under `services/media-lambda/build/`. The two artifact manifests record
the function bundle hash, ZIP hashes, exact upstream source and package sizes.

## Plan, inspect, apply

Deployment deliberately has two commands. `plan` may build and upload content-addressed packages,
but it only creates a CloudFormation Change Set. `apply` accepts that exact Change Set ARN; it does
not rebuild or silently reinterpret the plan.

```bash
export AWS_PROFILE=narratage
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=123456789012
export NARRATAGE_MEDIA_ENVIRONMENT=dev
export NARRATAGE_MEDIA_STACK=narratage-media-dev
export NARRATAGE_MEDIA_FUNCTION=narratage-media-dev
export NARRATAGE_MEDIA_ROLE=NarratageMediaExecution-dev
export NARRATAGE_MEDIA_LAYER=narratage-ffmpeg-8-0-1
export NARRATAGE_MEDIA_ARTIFACT_BUCKET=narratage-artifacts-123456789012
export NARRATAGE_MEDIA_DEPLOYMENT_BUCKET=your-regional-deployment-bucket

services/media-lambda/deploy.sh plan
services/media-lambda/deploy.sh apply <exact-change-set-arn>
```

Optional infrastructure parameters are `NARRATAGE_MEDIA_MEMORY` (3008),
`NARRATAGE_MEDIA_EPHEMERAL` (8192), `NARRATAGE_MEDIA_CONCURRENCY` (8) and
`NARRATAGE_MEDIA_LOG_RETENTION_DAYS` (14). They are CloudFormation parameters and therefore visible
in the Change Set.

The stack outputs an immutable function-version ARN and a complete JSON Endpoint entry for
`@narratage/provider-media-aws-lambda`. The Provider rejects an unqualified function name. Old
function and Layer versions are retained across updates so a recorded Runtime Profile never changes
meaning because a newer deployment happened.

## Live canary

The canary generates a one-second local fixture and runs all five remote media operations. Its S3
prefix is isolated and removed after success or failure unless `NARRATAGE_MEDIA_CANARY_KEEP=1`.

```bash
export NARRATAGE_MEDIA_FUNCTION_ARN=arn:aws:lambda:us-east-1:123456789012:function:narratage-media-dev:1
export NARRATAGE_MEDIA_ARTIFACT_BUCKET=narratage-artifacts-123456789012
pnpm --filter @narratage/media-lambda canary
```

No paid AWS deployment runs in the normal test suite. The handler tests execute the real shared
media implementation with local FFmpeg and an in-memory object store.
