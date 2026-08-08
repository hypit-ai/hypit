# Narratage media function

The five media Needs — inspect, normalize, speech-evidence projection, timeline
audio and mux — executed in AWS Lambda instead of on the machine running the
Build. This is deployment state, not an author-importable SVML package.

It owns no media logic. `@narratage/media-execution` holds the ffmpeg argv and
the frame arithmetic, and the same code answers a local Build through
`@narratage/provider-media-local`. Only two things are particular to this
deployment: where the bytes live, and which ffmpeg binary the image carries.

## What it requires, and why

**An S3 ArtifactStore, shared with the function.** A synchronous Lambda
invocation carries a few megabytes; a programme does not fit. So media never
travels in the payload — the request names the bucket the Artifacts already
occupy, and the function reads and writes there using the same
content-addressed key rule as `@narratage/artifact-store-s3`. A Provider
configured against a different bucket fails on the first result, naming the
Artifact it cannot read.

**An execution role** that can read and write the Artifact prefix in that
bucket, and write CloudWatch Logs. Nothing else.

## Deploying it

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=123456789012
export NARRATAGE_MEDIA_BUCKET=your-artifact-bucket
./publish.sh
```

`publish.sh` bundles the handler, asserts the FFmpeg version inside the image,
pushes to ECR under an immutable `bundle-<sha256>` tag, creates or updates the
function, publishes a **version**, and prints the Runtime Profile entry to
paste. Overridable: `NARRATAGE_MEDIA_REPOSITORY`, `_FUNCTION`, `_ROLE`,
`_MEMORY` (3008), `_TIMEOUT` (900), `_EPHEMERAL` (8192).

The printed ARN ends in `:<version>`. The Provider refuses an unqualified ARN:
a bare function name is whatever was deployed last, and two Builds of one Run
Source could then execute different code while recording the same Endpoint
identity.

## Checking it before you depend on it

```bash
pnpm narratage doctor svml.runtime.json
```

## Tests

The handler is tested against real ffmpeg over an in-memory bucket, so the
whole chain except AWS itself runs in `pnpm test`. What that does **not** cover
is the deployed image, the role's permissions and the account's limits; those
are only proven by publishing once and running a Build.

```bash
pnpm test                 # includes services/media-lambda/test
pnpm build:media-lambda   # bundle only, no AWS
```
