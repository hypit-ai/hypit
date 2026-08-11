# HyperFrames AWS Runtime

Status: the recoverable Endpoint package has passed both injected-client tests and a complete live
AWS acceptance run: site staging, checkpointed Step Functions polling, distributed frame
rendering, assembly, ArtifactStore ingestion, local ffprobe verification and remote
temporary-object cleanup. Stack
provisioning remains an adopter-owned deployment operation rather than package-import side effect.

## Boundary

`@narratage/provider-hyperframes-aws-lambda` drives an already deployed HyperFrames stack. It does
not provision AWS infrastructure and it does not change author source:

```text
HyperframesDocument
  -> render-visual Need
  -> Runtime selects this configured Endpoint
  -> content-addressed site upload
  -> one deterministic Step Functions execution
  -> checkpointed progress polling
  -> streamed S3 object
  -> RenderedVisual Artifact
```

The package imports only `@hyperframes/aws-lambda/sdk` at runtime, locked to version `0.7.101`.
It uses the AWS SDK default credential chain. AWS profile, SSO, environment credentials and instance
roles therefore remain deployment choices; access-key bytes are not Runtime configuration.

The Runtime Scheduler limits admitted render Needs through `defaultConcurrency`. HyperFrames'
`maxParallelChunks` and `chunkSize`/`targetChunkFrames` independently control frame work inside one
admitted render. These are two queues, not two copies of Build truth.

## Runtime Profile

After installing the package into `svml.runtime-packages.lock`, configure one Endpoint:

```json
{
  "use": "@narratage/provider-hyperframes-aws-lambda",
  "instance": "hyperframes.lambda.team",
  "authority": "hyperframes.lambda.team",
  "config": {
    "stateMachineArn": "arn:aws:states:us-east-1:123456789012:stateMachine:hyperframes-team",
    "bucketName": "hyperframes-team-render-bucket",
    "rendererImplementationDigest": "sha256:REVIEWED_DEPLOYMENT_CONTENT_DIGEST",
    "region": "us-east-1",
    "quality": "standard",
    "maxParallelChunks": 16,
    "defaultMemorySizeMb": 10240,
    "defaultConcurrency": 2
  }
}
```

`rendererImplementationDigest` is the content identity of the reviewed deployed renderer bundle or
deployment closure. The state-machine ARN is mutable location and is not sufficient identity. The
generic Need Receipt binds this configured Endpoint digest/configuration/Runtime closure, while the
HyperFrames attestation inside receipt-covered metadata repeats this renderer deployment digest and
the exact document digest.

Allow only the permissions declared by the Endpoint:

```json
["network:aws:s3", "network:aws:states"]
```

The distributed renderer accepts only integer 24, 30 and 60 fps. The request contract is closed:
an added hardware-GPU or unknown render requirement is declined so another Endpoint can satisfy the
Need. Nothing is silently converted. HyperFrames always receives strict SDR H.264/CFR software
render configuration and plan protocol v2.

This Endpoint currently declines every document containing a `CompositableSurface`. The local
Endpoint verifies Surface bytes against dimensions, timing, SDR/sRGB and alpha declarations before
rendering; the deployed Lambda route has no equivalent verifier yet, so accepting those documents
would make the same protocol weaker merely because execution moved remotely.

The Step Functions execution name and output key derive from the Runtime Operation's submission
key. A process crash before the first checkpoint therefore polls or resubmits the same AWS identity;
it cannot create a second render by choosing another UUID. A successful progress receipt must report
the document's exact total and rendered frame counts before bytes are accepted.

The progress receipt is not an ffprobe inspection. Deep codec/container validation remains an
explicit media Need. This lets a fully remote Runtime operate without acquiring a hidden local
FFmpeg dependency.

## Live canary

The canary is opt-in because it uses real AWS resources. It constructs a one-second, 24-frame
document, renders it through the Narratage recoverable Endpoint, verifies the downloaded H.264
stream has exactly 24 frames, and deletes that run's render/site prefixes unless
`NARRATAGE_HYPERFRAMES_CANARY_KEEP=1` is set:

```bash
AWS_PROFILE=my-profile \
AWS_REGION=us-east-1 \
NARRATAGE_HYPERFRAMES_STATE_MACHINE_ARN=arn:aws:states:us-east-1:123456789012:stateMachine:hyperframes-team \
NARRATAGE_HYPERFRAMES_BUCKET=hyperframes-team-render-bucket \
NARRATAGE_HYPERFRAMES_RENDERER_DIGEST=sha256:REVIEWED_DEPLOYMENT_CONTENT_DIGEST \
NARRATAGE_HYPERFRAMES_MEMORY_MB=2048 \
pnpm --filter @narratage/provider-hyperframes-aws-lambda canary
```

Every invocation gets a fresh Runtime operation identity, so repeated canaries never reuse an old
Step Functions execution whose output has already been cleaned. The canary needs local `ffprobe`
only for acceptance inspection; normal remote orchestration does not.

## Resource review before the first deploy

The upstream 0.7.101 SAM/CDK topology is expected to create or use:

- a CloudFormation/SAM render stack;
- SAM's managed deployment-artifact stack and bucket when `--resolve-s3` is used;
- one retained S3 render bucket for sites, plan-v2 manifests/blobs, chunks and final output;
- one Node 22 Lambda render function containing Chromium and FFmpeg, normally 10,240 MB, 15-minute
  timeout and an explicit reserved-concurrency cap;
- one Standard Step Functions state machine for Plan → parallel RenderChunk → Assemble;
- Lambda and Step Functions execution IAM roles and inline policies;
- CloudWatch log groups and the upstream runaway-invocation alarm;
- one local, non-secret `.hyperframes/lambda-stack-<name>.json` output file.

The retained render bucket survives stack deletion and must be emptied/deleted separately when it
is no longer wanted. The Narratage ArtifactStore bucket may be different: the Endpoint streams the
finished render out of the HyperFrames bucket and immediately persists it under the selected
content-addressed ArtifactStore.

The 0.7.101 package adds a supported `HyperframesRenderStack` CDK construct beside the SDK, but the
published tarball still contains no ready handler ZIP. Its packaged build script points at the
source-only `src/handler.ts`, so installing the package alone does not produce deployable bytes.
The first deployment therefore needs either an exact 0.7.101 source checkout to build and verify
the ZIP, or an independently reviewed immutable handler ZIP passed to the CDK construct. Importing
the Narratage Provider never provisions either path.

When that source checkout is built on macOS, `ffmpeg-static` follows the host platform by default.
Before packaging Lambda, select Linux x64 binary dependencies and verify that the bundled binaries
are Linux ELF files. Never treat a ZIP produced with host Mach-O binaries as deployable merely
because archive construction succeeded.

Before any real deploy, inspect the CloudFormation change set and confirm stack name, region,
reserved concurrency, memory, retained bucket and IAM resources. Only then place its output bucket
and state-machine ARN into the Runtime Profile.
