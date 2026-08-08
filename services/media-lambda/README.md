# Narratage media function

The five media Needs — inspect, normalize, speech-evidence projection, timeline audio and mux —
executed in AWS Lambda instead of on the machine running the Build. This is deployment state, not
an author-importable SVML package.

It owns no media logic. `@narratage/media-execution` holds the FFmpeg arguments and frame/sample
arithmetic, and the same code answers a local Build through `@narratage/provider-media-local`.
This service contributes only an S3 byte gateway and one managed-runtime Lambda entry point.

## Two immutable deployment objects

The deployment is intentionally split:

1. `build.mjs` produces a small Node.js 22 function ZIP containing the handler and all JavaScript
   dependencies;
2. an independently published Lambda Layer supplies `/opt/bin/ffmpeg` and `/opt/bin/ffprobe`.

`publish.sh` requires an exact Layer **version** ARN. It never selects a public Layer, never creates
an ECR repository and never invokes Docker. On the first invocation in each warm environment the
handler runs both binaries with `-version` and refuses the fulfillment unless both report FFmpeg
8.0.1.

The repository does not yet publish a redistributable FFmpeg Layer. That is deliberate: an exact
binary build, its complete license surface, upstream archive digest and regional Layer versions are
one supply-chain artifact of their own. Until that artifact is reviewed, the function packager is
complete but a fresh account must provide its own compatible Layer.

AWS mounts Layer `bin/` at `/opt/bin`. The reviewed Layer must therefore be:

- Linux x86-64 and compatible with Amazon Linux 2023;
- FFmpeg and FFprobe 8.0.1;
- packaged with executable paths `bin/ffmpeg` and `bin/ffprobe`;
- small enough that the uncompressed function plus all Layers remain within Lambda's quota;
- published in the same region as the function, with an immutable version ARN; it may be a
  separately permitted cross-account Layer.

## Data and authority

The function and the Build share one S3 ArtifactStore. Media bytes never travel in the synchronous
Lambda payload: requests name content-addressed objects, and results are written back under the same
key rule as `@narratage/artifact-store-s3`.

The execution role needs only read/write access to that Artifact prefix and CloudWatch Logs. The
publisher needs permission to update the named ZIP function, pass that role and read the selected
Layer version. Templates under `iam/` use `ACCOUNT_ID`, `REGION` and `BUCKET` placeholders.

Credentials always reach AWS clients through the SDK default credential chain. Keys do not enter
source, Runtime Profiles, BuildState or hand-assembled credential objects.

## First-time AWS setup

Create the shared Artifact bucket with public access blocked. Apply the substituted
`iam/execution.json` to the `NarratageMediaExecution` role, using `iam/execution-trust.json` as its
trust policy, and apply the substituted `iam/publisher.json` to the identity that publishes this
function. The same bucket can be the S3 ArtifactStore used by the Runtime.

The default function name is `narratage-media-zip`. AWS cannot convert an existing image-packaged
function to ZIP, so an old `narratage-media` image function can remain until its versioned ARN is no
longer referenced.

## Build and publish

Building is local, network-free and creates no cloud resource:

```bash
pnpm build:media-lambda
```

It writes ignored files under `services/media-lambda/build/`: `index.mjs`, `function.zip`, the
reviewed deployment description and its bundle hash.

Publishing mutates AWS and therefore requires an already reviewed Layer version:

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=123456789012
export NARRATAGE_MEDIA_BUCKET=your-artifact-bucket
export NARRATAGE_FFMPEG_LAYER_ARN=arn:aws:lambda:us-east-1:123456789012:layer:narratage-ffmpeg-8-0-1:1
./publish.sh
```

The script verifies region affinity, resolves the Layer before mutation, creates or updates
the ZIP function, verifies the complete effective configuration, publishes an immutable function
version and prints the Runtime Profile Endpoint entry. The Provider refuses an unqualified
function ARN.

No real AWS deployment is part of the normal test suite. The handler itself is exercised with real
local FFmpeg over an in-memory bucket, including rejection of a Layer version mismatch.
