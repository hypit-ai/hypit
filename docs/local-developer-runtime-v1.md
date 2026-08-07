# Local developer Runtime v1

Status: implemented reference assembly, KIE generation Provider, local media Provider, local
HyperFrames Provider, local WhisperX Provider and its locked Python service. Hosted/AWS variants
remain optional.

## 1. Outcome

A developer owns one authoritative SVML Runtime process and may independently choose where every
external capability executes:

```text
build.svrun -> main.svml
  -> self-described Run + Author compilation
  -> Core BuildState
  -> @svml/local Scheduler
       -> local deterministic component code
       -> KIE / Volcengine / Hypit Seedance Endpoint
       -> local / Lambda / Hypit WhisperX Endpoint
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
| `@svml/runtime` | environment-neutral Scheduler, Store and Endpoint ports plus Runtime service-package ABI | Node, SQLite, files, video |
| `@svml/store-sqlite` | durable BuildStore and OperationStore adapters | ready queue, artifacts, credentials |
| `@svml/artifact-store-fs` | content-addressed project bytes | BuildState, cache policy, author library |
| `@svml/artifact-store-s3` | conditionally written and digest-verified S3 bytes | BuildState, Endpoint jobs, automatic reuse |
| `@svml/local` | developer convenience assembly and trusted package activation | author syntax, Endpoint APIs, hosted auth |
| `@svml/endpoint-kit` | host-neutral Endpoint contract and one-source package definition | any concrete vendor API or Driver |
| `@svml/transport` | canonical request/response transport seam | capability identity, recovery or scheduling |
| `@svml/credential-store-env` | explicitly requested local environment secrets | enumeration, persistence or author imports |
| `@svml/transport-aws-lambda` | synchronous bounded JSON invocation | capability identity or remote job semantics |
| `@svml/transport-process` | shell-free, bounded, no-ambient-env local JSON process | capability identity or executable choice from source |
| `@svml/provider-*` | one exact external implementation and its polling/recovery | Core graph traversal, author parsing |

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

The ordinary CLI path is closed declarative deployment data. Exact adapter names are resolved by a
Host-owned registry; unknown adapters fail and the file cannot contain callbacks or secret values:

```json
{
  "format": "svml.runtime-config@1",
  "services": [],
  "endpoints": [
    {
      "use": "@svml/provider-kie",
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

Executable TypeScript remains the advanced embedding form for private transports and adapters not
yet registered in the reference CLI. It is trusted developer/deployment code, not author intent:

```ts
import { createProjectLocalRuntime } from "@svml/local";
import { createS3ArtifactStorePackage } from "@svml/artifact-store-s3";
import { credentialRef } from "@svml/runtime";
import { createKieProvider } from "@svml/provider-kie";
import { createLocalMediaProvider } from "@svml/provider-media-local";
import { createLocalWhisperXProvider } from "@svml/provider-whisperx-local";
import { createLocalHyperframesProvider } from "@svml/provider-hyperframes-local";

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
    "filesystem:whisperx-staging",
    "network:whisperx-loopback",
    "process:hyperframes",
  ],
  scheduling: {
    maxConcurrency: 8,
    lanes: {
      "endpoint:kie.personal": 2,
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
`svml-v2 lock-packages`. It supplies enumerable deterministic Producer and Validator facets; the
Runtime config no longer imports each component by name. Its digest must equal the
`BuildRequest.implementationClosure` produced by `plan`/`build` with the same lock, so durable work
cannot resume after an unnoticed component-closure swap. The low-level `components` option remains
available for trusted embedding and tests, but is not the reproducible project default.

The KIE, local media, local WhisperX and local HyperFrames package functions in this example are
implemented. `@svml/endpoint-kit` implements the host-neutral
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
Volcengine are Provider packages that may each fulfill explicit Seedance capabilities. WhisperX and
HyperFrames are implementations we may run locally or on AWS. The local packages now exist as
`provider-whisperx-local` and `provider-hyperframes-local`; matching `*-aws` packages remain
deployment targets. Lambda and process transports remain lower-level helpers and cannot register
any of those capabilities by themselves.

## 5. Build command and recovery

The v2 CLI now accepts:

```bash
pnpm svml:v2 build build.svrun \
  --runtime ./svml.runtime.json \
  --package-lock ./svml.packages.lock \
  --root . \
  --follow

pnpm svml:v2 status <build-id> --runtime ./svml.runtime.json
pnpm svml:v2 inspect <build-id> --runtime ./svml.runtime.json
pnpm svml:v2 get <build-id> --runtime ./svml.runtime.json --to ./result.bin
pnpm svml:v2 cancel <build-id> --runtime ./svml.runtime.json
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
[`build-archive-and-egress-v1.md`](./build-archive-and-egress-v1.md).

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
| WhisperX local to Lambda | exact WhisperX Provider package | author-declared WhisperX method |
| KIE to Volcengine for an explicitly supported method | Provider package and locked binding | source unless author parameters differ |
| local HyperFrames to Lambda | HyperFrames Provider package | HyperframesDocument and frame domain |
| local Build to Hypit hosted Build | whole Runtime distribution | author/module closure and Core protocol |

Provider replacement is never a creative router guessing whether `<speaker>` means Seedance or
Kling. The author package fixes the demanded capability/model. Runtime configuration selects the
exact implementation endpoint or an explicit Candidate chosen outside the source.

## 8. Remaining vertical work

The durable local chassis and first local external execution set are implemented. A real talking-
video build still requires:

1. keep the credentialed KIE smoke suite opt-in as Provider contracts evolve (the representative
   seven-family run and synthetic-reference upload passed on 2026-08-06);
2. official Speech assembly, Caption, B-roll and Text Track Surfaces; authored Image/Audio, exact
   Seedance Prompt/Speech/Video Surfaces and the SVS-backed Seedance Speaker Kit are implemented;
3. audit and implement the complete package-owned Caption style/positioning Recipe before freezing
   its author Surface; SpeechTake, Speech Align and the current deterministic Caption facets are
   already locked and activated from the official implementation package;
4. add Lambda-backed variants only when deployment pressure justifies them.

Hosted tenant auth, credits, Redis, a distributed queue and Hypit-wide Build hosting remain outside
this phase.
