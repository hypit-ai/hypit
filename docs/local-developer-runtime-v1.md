# Local developer Runtime v1

Status: implemented reference assembly, KIE generation Provider, local media Provider, local
HyperFrames Provider, local WhisperX Provider and its locked Python service. Hosted/AWS variants
remain optional.

## 1. Outcome

A developer owns one authoritative SVML Runtime process and may independently choose where every
external capability executes:

```text
main.svml
  -> trusted compiler
  -> Core BuildState
  -> @svml/local Scheduler
       -> local deterministic component code
       -> KIE / Volcengine / Hypit Seedance Endpoint
       -> local / Lambda / Hypit WhisperX Endpoint
       -> local workers / Lambda / Hypit HyperFrames Endpoint

durable facts       .svml/runtime.sqlite
artifact bytes      .svml/artifacts/ (or an S3 ArtifactStore)
provider jobs       owned by each Endpoint
```

The Provider may be remote without making the Build remote. The local process remains the only
authority that asks Core what is ready and accepts returned Events.

## 2. Physical packages

| Package | Owns | Does not own |
|---|---|---|
| `@svml/runtime` | environment-neutral Scheduler, Store and Endpoint ports | Node, SQLite, files, video |
| `@svml/store-sqlite` | durable BuildStore and OperationStore adapters | ready queue, artifacts, credentials |
| `@svml/artifact-store-fs` | content-addressed project bytes | BuildState, cache policy, author library |
| `@svml/artifact-store-s3` | conditionally written and digest-verified S3 bytes | BuildState, Provider jobs, automatic reuse |
| `@svml/local` | developer convenience assembly and trusted package activation | author syntax, Provider APIs, hosted auth |
| `@svml/provider-kit` | one-source definition of Manifest, configured instance, binding and Node registration | any concrete vendor API |
| `@svml/credential-store-env` | explicitly requested local environment secrets | enumeration, persistence or author imports |
| `@svml/transport-aws-lambda` | synchronous bounded JSON invocation | capability identity or remote job semantics |
| `@svml/transport-process` | shell-free, bounded, no-ambient-env local JSON process | capability identity or executable choice from source |
| `@svml/provider-*` | one exact external implementation and its polling/recovery | Core graph traversal, author parsing |

SQLite is deliberately optional. `createLocalRuntime()` accepts any implementation of the same
ports, so an internal server can use Postgres and S3 without changing Core or Provider packages.
`createProjectLocalRuntime()` selects the zero-service SQLite/filesystem defaults.

## 3. Project entities

The reference local assembly creates only private Runtime state:

```text
client-video/
  main.svml
  studio.svs
  svml.runtime.ts
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

The configuration module is trusted developer/deployment code. It is not imported by `.svml` and
does not become author intent:

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
  artifacts: createS3ArtifactStorePackage({
    instance: "artifacts.team",
    bucket: "hypit-svml-artifacts",
    prefix: "development",
    region: "us-east-1",
  }),
  providers: [
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
      "provider:kie.personal": 2,
      "provider:whisperx.local": 1,
      "provider:hyperframes.local": 1,
    },
  },
});
```

`svml.packages.lock` is created from explicitly installed component aggregates with
`svml-v2 lock-packages`. It supplies enumerable deterministic Producer and Validator facets; the
Runtime config no longer imports each component by name. Its digest must equal the
`BuildRequest.implementationClosure` produced by `plan`/`build` with the same lock, so durable work
cannot resume after an unnoticed component-closure swap. The low-level `components` option remains
available for trusted embedding and tests, but is not the reproducible project default.

The KIE, local media, local WhisperX and local HyperFrames Provider functions in this example are
implemented. `@svml/provider-kit` implements the
`NodeProviderPackage` definition path and lets those packages contribute:

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
pnpm svml:v2 build main.svml \
  --target final.video \
  --runtime ./svml.runtime.ts \
  --follow

pnpm svml:v2 status <build-id> --runtime ./svml.runtime.ts
pnpm svml:v2 cancel <build-id> --runtime ./svml.runtime.ts
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
| files to S3 | ArtifactStore adapter | BuildStore, Provider packages |
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
2. official generation, Speech, Caption, B-roll and Text Track Surfaces;
3. finish the official deterministic Speech/Align/Caption component facets;
4. add Lambda-backed variants only when deployment pressure justifies them.

Hosted tenant auth, credits, Redis, a distributed queue and Hypit-wide Build hosting remain outside
this phase.
