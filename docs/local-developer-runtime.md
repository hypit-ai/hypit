# Local developer Runtime

Status: implemented reference assembly, KIE generation Provider, local media/image/HyperFrames/
WhisperX Providers, S3 ArtifactStore, AWS media Provider and recoverable AWS HyperFrames Provider.
Hosted orchestration and a persistent remote WhisperX service remain optional.

## 1. Outcome

A developer owns one authoritative Narratage Runtime process and may independently choose where every
external capability executes:

```text
build.svrun -> main.svml
  -> self-described Run + Author compilation
  -> Core BuildState
  -> @narratage/local Scheduler
       -> local deterministic component code
       -> KIE / Volcengine / Hypit Seedance Endpoint
       -> local OpenCV image-transform Endpoint
       -> local / team-hosted / Hypit warm WhisperX service Endpoint
       -> local workers / Lambda / Hypit HyperFrames Endpoint

durable facts       .svml/runtime.sqlite
artifact bytes      .svml/artifacts/ (or an S3 ArtifactStore)
external jobs       owned by each Endpoint
```

An Endpoint may be remote without making the Build remote. The local process remains the only
authority that asks Core what is ready and accepts returned Events.

## 2. Physical packages

| Package | Owns | Does not own |
|---|---|---|
| `@narratage/runtime` | environment-neutral Scheduler, Store and Endpoint ports plus Runtime service-package ABI | Node, SQLite, files, video |
| `@narratage/runtime-adapter` | locked Host facet that constructs one configured Endpoint or service package | package discovery, author imports, Provider routing |
| `@narratage/runtime-adapter-node` | project-root executable resolution and read-only Node diagnostics | capability semantics or process execution |
| `@narratage/store-sqlite` | durable BuildStore and OperationStore adapters | ready queue, artifacts, credentials |
| `@narratage/artifact-store-fs` | content-addressed project bytes | BuildState, cache policy, author library |
| `@narratage/artifact-store-s3` | conditionally written and digest-verified S3 bytes | BuildState, Endpoint jobs, automatic reuse |
| `@narratage/local` | developer convenience assembly and trusted package activation | author syntax, Endpoint APIs, hosted auth |
| `@narratage/endpoint-kit` | host-neutral Endpoint contract and one-source package definition | any concrete vendor API or Driver |
| `@narratage/transport` | canonical request/response transport seam | capability identity, recovery or scheduling |
| `@narratage/credential-store-env` | explicitly requested local environment secrets | enumeration, persistence or author imports |
| `@narratage/transport-aws-lambda` | synchronous bounded JSON invocation | capability identity or remote job semantics |
| `@narratage/provider-*` | one exact external implementation and its polling/recovery | Core graph traversal, author parsing |

The implemented remote video Endpoints are `@narratage/provider-media-aws-lambda` and
`@narratage/provider-hyperframes-aws-lambda`. The former is synchronous Lambda transport around
the shared media execution body; the latter owns one recoverable Step Functions job. See
[`hyperframes-aws-runtime.md`](./hyperframes-aws-runtime.md) before provisioning its stack.

SQLite is deliberately optional. `createLocalRuntime()` accepts any implementation of the same
ports, so an internal server can use Postgres and S3 without changing Core or Endpoint packages.
`createProjectLocalRuntime()` selects the zero-service SQLite/filesystem defaults.

## 3. Project entities

The reference local assembly creates only private Runtime state:

```text
client-video/
  main.svml
  studio.svs
  build.svrun
  svml.runtime.json
  assets/
  .svml/
    runtime.sqlite
    artifacts/
  output/
```

The SQLite schema contains opaque, versioned framework facts:

- verified BuildState snapshots and CAS revisions;
- Operation identities, stable submission keys, checkpoints and completions.

It contains no component-specific business tables and no ready-command queue. Installing a new
Caption, Seedance or B-roll package does not add a table. Core regenerates ready Commands from the
last verified BuildState after every restart.

Artifacts are not SQLite blobs. Credentials are not stored in BuildState, Operation metadata,
source files or the database.

## 4. Runtime configuration

The ordinary CLI path is closed declarative deployment data. Exact adapter names are resolved from
a separately locked physical package inventory; unknown adapters fail and the file cannot contain
callbacks or secret values:

```json
{
  "format": "svml.runtime-config@1",
  "packageLock": "./svml.packages.lock",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.personal",
      "lane": "generation",
      "config": { "apiKeyEnv": "KIE_API_KEY", "defaultConcurrency": 2 }
    }
  ],
  "permissions": [
    "network:api.kie.ai",
    "network:kieai.redpandaai.co"
  ],
  "scheduling": { "maxConcurrency": 8, "lanes": { "generation": 2 } }
}
```

Create the two closures explicitly:

```bash
narratage lock-packages ./svml.packages.lock \
  --package @narratage/script --package @narratage/seedance --root .

narratage lock-packages ./svml.runtime-packages.lock \
  --package @narratage/provider-kie \
  --package @narratage/provider-media-local \
  --package @narratage/provider-whisperx-local \
  --package @narratage/provider-hyperframes-local \
  --root .

narratage doctor ./svml.runtime.json
```

The same generic lock format is reused, but the two references grant different Host ABIs.
`packageLock` activates deterministic compute facets. `runtimePackageLock` activates only Runtime
Adapter facets; author and Surface facets found in those packages stay inert. Provider packages are
therefore installable without adding imports or CI changes to `@narratage/video-cli`.

Executable TypeScript remains the advanced embedding form for private transports and adapters not
yet registered in the reference CLI. It is trusted developer/deployment code, not author intent:

```ts
import { createProjectLocalRuntime } from "@narratage/local";
import { createS3ArtifactStorePackage } from "@narratage/artifact-store-s3";
import { credentialRef } from "@narratage/runtime";
import { createKieProvider } from "@narratage/provider-kie";
import { createLocalMediaProvider } from "@narratage/provider-media-local";
import { createLocalOpenCvImageProvider } from "@narratage/provider-image-opencv-local";
import { createLocalWhisperXProvider } from "@narratage/provider-whisperx-local";
import { createLocalHyperframesProvider } from "@narratage/provider-hyperframes-local";

export default await createProjectLocalRuntime({
  root: import.meta.dirname,
  packageLock: "./svml.packages.lock",
  runtimeServices: [createS3ArtifactStorePackage({
    instance: "artifacts.team",
    bucket: "hypit-svml-artifacts",
    prefix: "development",
    region: "us-east-1",
  })],
  endpoints: [
    createKieProvider({ instance: "kie.personal", apiKey: credentialRef("env", "KIE_API_KEY") }),
    createLocalMediaProvider({ instance: "media.local", defaultConcurrency: 1 }),
    createLocalOpenCvImageProvider({
      instance: "image.opencv.local",
      pythonExecutable: "./services/image-opencv/.venv/bin/python",
      defaultConcurrency: 2,
    }),
    createLocalWhisperXProvider({
      instance: "whisperx.local",
      baseUrl: "http://127.0.0.1:8765",
      expectedModel: "small",
      expectedDevice: "cpu",
      expectedCompute: "int8",
      expectedBatchSize: 8,
      defaultConcurrency: 1,
    }),
    createLocalHyperframesProvider({
      instance: "hyperframes.local",
      workers: 4,
      defaultConcurrency: 1,
    }),
  ],
  allowedPermissions: [
    "network:aws:s3",
    "network:api.kie.ai",
    "network:kieai.redpandaai.co",
    "process:media",
    "process:image",
    "filesystem:whisperx-staging",
    "network:whisperx-loopback",
    "process:hyperframes",
  ],
  scheduling: {
    maxConcurrency: 8,
    lanes: {
      "endpoint:kie.personal": 2,
      "endpoint:image.opencv.local": 2,
      "endpoint:whisperx.local": 1,
      "endpoint:hyperframes.local": 1,
    },
  },
});
```

`runtimeServices` is not a bag of callbacks. Every package binds its actual service object to a
static Manifest facet, configured instance digest, role and permission set. If exactly one supplied
service implements a role, the local assembly selects it. If several do, `runtimeSelection` must
name the exact instance. Unselected alternatives never gain scheduling or storage authority.
Built-in local services receive only their known local permissions automatically; permissions from
supplied packages remain explicit Host allowlist decisions.
The created Runtime owns every supplied configured package until `close()`: selected packages serve
requests, while all supplied packages are closed exactly once so an unselected database/client
cannot leak resources. Package code is still trusted deployment code and is never activated by
author imports.

`svml.packages.lock` is created from explicitly selected physical packages with
`narratage lock-packages`. It supplies enumerable deterministic Producer and Validator facets; the
Runtime config no longer imports each component by name. Its digest must equal the
`BuildRequest.implementationClosure` produced by `plan`/`build` with the same lock, so durable work
cannot resume after an unnoticed component-closure swap. The low-level `components` option remains
available for trusted embedding and tests, but is not the reproducible project default.

`svml.runtime-packages.lock` independently binds privileged deployment adapters. The Host hashes
every file in their dependency closure before importing activation code, then derives the effective
Endpoint/Store implementation digest from the physical package Artifact, that package's transitive
dependency closure, adapter identity and declared facet. Editing implementation bytes without regenerating the lock fails
before any Provider call. Source `<import>` cannot add an adapter to this closure.

The KIE, local media, local OpenCV image-transform, local WhisperX and local HyperFrames package
functions in this example are implemented. `@narratage/endpoint-kit` implements the host-neutral
`EndpointPackage` definition path and lets those packages contribute:

1. a static Runtime Manifest and implementation digest;
2. one configured Endpoint instance;
3. exact Capability/return bindings;
4. registration code for `start/resume/cancel`;
5. its default concurrency lane and permission declaration.

The same definition also locks declared credential slot names, credential references, finite retry
policy and all non-secret instance configuration. Secret values are resolved from the selected
CredentialStore only when that exact endpoint is invoked. A Provider package cannot put secret bytes
in `configuration`; doing so is a package bug and violates this API's contract.

The local distribution resolves all contributions into one Runtime Closure before execution. A
same-name Endpoint with different implementation bytes is rejected before an API call.

Start the independently locked Python service before building a speech program:

```bash
uv python install 3.13
uv sync --project services/whisperx --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
uv run --project services/whisperx --frozen svml-whisperx-check
uv run --project services/whisperx --frozen svml-whisperx-service
```

The Node Provider verifies the service protocol, service version, WhisperX version, model, device,
compute type and batch size through `/health` before every admitted inference. The Python service
reads only canonical evidence WAVs below `SVML_WHISPERX_INPUT_ROOTS`; it has no FFmpeg path and no
script/caption semantics.

Provider naming follows execution reality. Seedance is an author-selected method, while KIE and
Volcengine are Provider packages that may each fulfill explicit Seedance capabilities. OpenCV,
WhisperX and HyperFrames are concrete implementations we may run locally or replace at deployment.
The local packages exist as `provider-image-opencv-local`, `provider-whisperx-local` and
`provider-hyperframes-local`; AWS media and HyperFrames packages already satisfy the same public
Needs without changing author syntax or Core. Lambda and process transports remain lower-level
helpers and cannot register any capability by themselves.

## 5. Build command and recovery

The CLI accepts:

```bash
pnpm narratage build build.svrun \
  --runtime ./svml.runtime.json \
  --package-lock ./svml.packages.lock \
  --root . \
  --follow

pnpm narratage status <build-id> --runtime ./svml.runtime.json
pnpm narratage inspect <build-id> --runtime ./svml.runtime.json
pnpm narratage get <build-id> --runtime ./svml.runtime.json --to ./result.bin
pnpm narratage cancel <build-id> --runtime ./svml.runtime.json
pnpm narratage doctor ./svml.runtime.json
pnpm narratage gc ./svml.runtime.json
pnpm narratage gc ./svml.runtime.json --apply
```

The default local Build id is the content-derived Core Build id. Repeating the same command resumes
the same Build. `--build-id take-02` creates an explicit run identity, but that name may never be
reused for a different Core Build.

Every accepted Event is committed to BuildStore before the Scheduler advances. Without `--follow`,
a pending external job returns `paused`; rerunning reopens SQLite and calls `resume` with the same
Operation and submission key. With `--follow`, the same process waits until the Endpoint's `wakeAt`
hint (or a local fallback interval) and repeats the authoritative scheduling step. A completion
already saved before a crash is replayed into Core without calling the Endpoint again.

`status` reads the verified Build snapshot plus its Operation attempts. `cancel` invokes each active
Endpoint's optional cancellation hook, journals a non-retryable `CANCELLED` failure and lets Core
accept that terminal fact. Retryable failures create a new attempt and submission key only when the
package's finite retry policy allows it; recovering one existing attempt never changes its key.

Every accepted output in the demanded closure remains in BuildState, not only the Targets.
Referenced bytes remain in ArtifactStore. `inspect` exposes that archive without reading private
Store paths; `get` optionally copies one direct Artifact or writes one structured Record as JSON.
Neither command resumes execution, and omitting `get` never discards a result. See
[`build-archive-and-egress.md`](./build-archive-and-egress.md).

`gc` is explicit deployment maintenance. Its default is a dry-run report. The local implementation
enumerates every retained BuildState and Operation, recursively finds their BlobRefs and only then
offers deletion of unreachable objects from a managed ArtifactStore. There is no age heuristic,
automatic cache hit or hidden Candidate selection. The filesystem Store also exposes a streaming
port so large-object adapters can avoid making whole-object transfer a framework requirement.

## 6. Queue law

There are still two distinct scheduling scopes:

1. the local Build Scheduler limits already-authorized Core Commands across Builds and lanes;
2. a Provider Endpoint may submit one Command into KIE, Lambda, SQS or a Hypit job system.

Redis is unnecessary for the single-process developer Runtime. A future multi-process Host may use
a dispatcher transport, but Redis/SQS cannot become Build truth and cannot replace BuildStore CAS.
For two developers sharing one authority, run one internal Runtime service with Postgres; do not put
the SQLite file on S3 or a network filesystem.

## 7. Environment replacement matrix

| Change | Replace | Unchanged |
|---|---|---|
| laptop to internal server | Runtime config paths and deployment | `.svml`, Core, components |
| files to S3 | ArtifactStore service package | BuildStore, Endpoint packages |
| SQLite to Postgres | Build/Operation Store adapters | Scheduler law, Core |
| WhisperX local to a persistent remote service | exact WhisperX Provider package | author-declared WhisperX method |
| KIE to Volcengine for an explicitly supported method | Provider package and locked binding | source unless author parameters differ |
| local HyperFrames to Lambda | HyperFrames Provider package | HyperframesDocument and frame domain |
| local Build to Hypit hosted Build | whole Runtime distribution | author/module closure and Core protocol |

Provider replacement is never a creative router guessing whether `<speaker>` means Seedance or
Kling. The author package fixes the demanded capability/model. Runtime configuration selects the
exact implementation endpoint or an explicit Candidate chosen outside the source.

## 8. Remaining vertical work

The durable local chassis and one real talking-video path are implemented. Different fresh, reuse
and preview executions belong in explicit Run sources; the local Runtime needs no example-specific
acceptance orchestrator. Remaining work is to:

1. finish package-owned Caption field-to-word painting, Text three-box/exact-font authoring and
   B-roll content-frame behavior before freezing those author Surfaces;
2. migrate Ranking and other production components only after their meanings fit the peer-Track
   contract;
3. add a persistent remote WhisperX Provider or further environment variants only when a concrete
   deployment requires them.

Hosted tenant auth, credits, Redis, a distributed queue and Hypit-wide Build hosting remain outside
this phase.
