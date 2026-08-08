# HyperFrames AWS Runtime

Status: the recoverable Endpoint package is implemented and tested with an injected SDK client. No
HyperFrames AWS stack or paid render has been created from this repository yet.

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

The package imports only `@hyperframes/aws-lambda/sdk` at runtime, locked to version `0.7.84`.
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
  "lane": "render",
  "config": {
    "stateMachineArn": "arn:aws:states:us-east-1:123456789012:stateMachine:hyperframes-team",
    "bucketName": "hyperframes-team-render-bucket",
    "region": "us-east-1",
    "quality": "standard",
    "maxParallelChunks": 16,
    "defaultMemorySizeMb": 10240,
    "defaultConcurrency": 2
  }
}
```

Allow only the permissions declared by the Endpoint:

```json
["network:aws:s3", "network:aws:states"]
```

The distributed renderer accepts only integer 24, 30 and 60 fps. The request contract is closed:
an added hardware-GPU or unknown render requirement is declined so another Endpoint can satisfy the
Need. Nothing is silently converted. HyperFrames always receives strict SDR H.264/CFR software
render configuration and plan protocol v2.

The Step Functions execution name and output key derive from the Runtime Operation's submission
key. A process crash before the first checkpoint therefore polls or resubmits the same AWS identity;
it cannot create a second render by choosing another UUID. A successful progress receipt must report
the document's exact total and rendered frame counts before bytes are accepted.

The progress receipt is not an ffprobe inspection. Deep codec/container validation remains an
explicit media Need. This lets a fully remote Runtime operate without acquiring a hidden local
FFmpeg dependency.

## Resource review before the first deploy

The upstream 0.7.84 SAM topology is expected to create or use:

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

Do not run the upstream generated deploy policy unchanged. HyperFrames 0.7.84 emits the nonexistent
IAM action `s3:PutPublicAccessBlock`; AWS requires `s3:PutBucketPublicAccessBlock`. Its own policy
validator repeats the typo and therefore cannot detect it.

There is also a packaging constraint: the published HyperFrames 0.7.84 CLI can drive an existing
stack, but its `lambda deploy` command searches a HyperFrames source checkout for
`examples/aws-lambda/template.yaml` and the handler build workspace. The published SDK package does
not contain that template or a ready handler ZIP. The first deployment must therefore use an exact
0.7.84 HyperFrames source checkout (or a reviewed Narratage-owned CDK/SAM distribution), not assume
that installing the SDK alone is a deployable stack.

Before any real deploy, inspect the CloudFormation change set and confirm stack name, region,
reserved concurrency, memory, retained bucket and IAM resources. Only then place its output bucket
and state-machine ARN into the Runtime Profile.
