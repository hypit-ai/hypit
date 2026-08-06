# SVML Package Vocabulary and Ownership v1

Status: target architecture vocabulary; not yet a public compatibility freeze.

This document fixes the names and ownership boundaries that should be used while reorganizing the
v2 repository. It covers framework packages, author modules, video modules, executable facets,
Runtime services, queues, stores, Providers and distributions. Existing directory names remain the
implementation reality until an atomic migration is performed.

The primary rule is:

> Name a public thing after the concept or authority it owns, not after the implementation step in
> which it happens to be used.

## 1. Three identities that must not be called “a package” interchangeably

### 1.1 Distribution package

A distribution package is a physical npm artifact. It answers how code is installed and updated.
One npm artifact may carry several independently identified SVML modules and executable facets.

Examples:

```text
@svml/compiler-node
@svml/runtime-node
@svml/video
@svml/provider-kie
```

Updating a physical artifact does not by itself change author meaning. Only changed locked module,
implementation or Runtime Closure digests do.

### 1.2 SVML module

An SVML module owns language vocabulary: nominal Types, Surfaces, Producers and Capabilities. It is
identified by its `ModuleRef` and immutable Manifest digest. Module boundaries determine semantic
compatibility and dependency invalidation.

Examples:

```text
@svml/narrative
@svml/speech
@svml/composition
@svml/caption
```

Several logical modules may be delivered by one physical `@svml/video` distribution. They must
still have separate Manifests and digests so that changing Track does not invalidate Narrative.

### 1.3 Runtime instance

A Runtime instance is configured state created from installed code. It answers which Scheduler,
stores, credentials and Provider Endpoints this process or deployment actually uses.

Examples:

```text
kie.personal
whisperx.local
hypit.production
sqlite.workspace
artifacts.project
```

An account, database, queue namespace or tenant is an instance, never a new npm package or author
module.

## 2. Naming grammar

1. Framework packages use familiar compiler/runtime nouns: `protocol`, `core`, `compiler`,
   `runtime`, `cli`.
2. Domain modules use the concept they own: `narrative`, `speech`, `caption`, `composition`.
3. The framework role is `Endpoint`. A real vendor integration may use the `provider-` prefix;
   local, device or human implementations need not pretend to be vendors.
4. An environment suffix such as `-node`, `-browser` or `-worker` is used only for a real environment
   adapter.
5. A storage implementation uses `role-backend`, such as `artifact-store-fs` or
   `credential-store-keychain`.
6. A composition module is named after the author concept it implements, such as `speech-program`;
   generic buckets such as `video-fragments`, `common` and `utils` are forbidden public names.
7. `official`, `default`, `new`, `v2` and file suffixes such as `.svk` do not establish a package
   role.
8. Interface names are singular (`BuildStore`); package names are kebab-case; configured instance
   ids are local and may use dotted names (`sqlite.workspace`).

## 3. Framework package target

| Current repository package | Target public ownership | Decision |
|---|---|---|
| `@svml/protocol` | immutable wire data, canonical identity and static Manifest representation | keep |
| `@svml/core` | domain-free Demand compiler and verified Build state machine | keep |
| `@svml/elaborator` | environment-neutral author-to-Graph compiler | rename to `@svml/compiler` |
| `@svml/realization` | external Candidate attachment | keep as `@svml/compiler/candidates`, not a physical package |
| `@svml/validation` | semantic value admission before trusted state | rename to `@svml/admission` |
| `@svml/component-kit` | host-neutral deterministic Producer and validator registration port | keep |
| `@svml/endpoint-kit` | host-neutral capability Endpoint ABI, registrar and package definition | keep |
| `@svml/transport` | capability-free canonical request/response transport seam | keep |
| `@svml/host` | domain-neutral contracts for concrete definition environments | keep deliberately small |
| `@svml/workspace-fs-node` | root-confined Node filesystem Workspace implementation | keep |
| `@svml/compiler-node` | Node compiler facade and registered-module assembly over an injected Workspace | keep |
| `@svml/package-loader-node` | locked activation of trusted installed package facets | keep |
| `@svml/driver-node` | Node Runtime execution of Core Commands | rename to `@svml/runtime-node` |
| `@svml/text` | official markup document Frontend and Surface dispatch | rename to `@svml/markup` |
| `@svml/script` | official Script Surface | keep |
| `@svml/svs` | official SVS Frontend | keep |
| `@svml/cli` | trusted official command-line assembly | keep |

The target dependency direction is below. `A -> B` means B depends on A:

```text
protocol -> core
core -> compiler
core -> admission
protocol + admission -> component-kit
protocol + runtime -> endpoint-kit
protocol -> transport
compiler -> host
host -> workspace-fs-node
compiler + admission + host + workspace-fs-node -> compiler-node
core -> runtime
runtime + admission + component-kit + endpoint-kit -> runtime-node
compiler-node + runtime-node + selected domain packages -> cli
```

`@svml/runtime` may be introduced when the environment-neutral service interfaces in section 8 are
implemented. It must not become a second Core: it owns execution and persistence ports, not Graph,
Demand or state-transition laws.

Pure Manifest parsing belongs with the Protocol representation. Reading a Manifest from a Node
path belongs to `@svml/compiler-node` or `@svml/runtime-node`. The current placement of the Manifest
parser in `@svml/driver-node` is transitional and must not become public API.

## 4. Video logical module target

The current `@svml/contracts` Manifest is too broad. It should become independently locked logical
modules named after the concepts they own.

### 4.1 `@svml/narrative`

Owns:

```text
Narrative
SemanticIndex
Segment and Token identities
Selection and Moment identities
authoritative speech/display projections that are part of Narrative
```

`@svml/script` is one Surface that produces Narrative. It does not privately own the shared Type.

### 4.2 `@svml/media`

Owns already-materialized media facts:

```text
BlobArtifact
MediaArtifact
FontArtifact
CompositableSurface
MediaInspection and every enumerated container stream
MediaStreamSelection
SynchronizedMedia and its source presentation transform
```

It does not own Seedance, upload, caching, rendering, ffmpeg deployment or Provider choices. An
embedded audio stream is an observed media fact; only `@svml/speech` may bind it to a Narrative and
promote it into a SpeechBasis.

### 4.3 `@svml/program-space`

Owns the exact frame domain:

```text
ProgramSpace
FrameRate
FrameSpan
time/frame projection laws
```

The longer name is intentional. `program`, `timeline` and `timebase` are too ambiguous.

### 4.4 `@svml/speech`

Owns:

```text
SpeechBasis
SpeechAudioBasis
speech Product Segment facts
deterministic audio, visual, audio-track and ProgramSpace projections
```

The current `@svml/speech-take` package should be absorbed here. A Take remains a useful author or
Product concept, but the shared module is named after the broader thing it owns.

### 4.5 `@svml/semantic-time`

Owns Provider-neutral evidence and author-semantic time:

```text
AlignedTranscriptEvidence
CompleteSemanticMap
anchor/token/Segment time facts
measured/derived/estimated quality
```

It does not own WhisperX. WhisperX is one evidence method.

### 4.6 `@svml/composition`

Owns the audiovisual narrow waist:

```text
VisualTrack
AudioTrack
Present
VisualElement
HyperFrames Visual IR v1 schema and validation
Composition
```

It may depend on `media` and `program-space`. It must not recognize Caption, B-roll, Film or
Seedance families, nor import a HyperFrames compiler or Provider. The named Visual IR is the common
video target protocol owned here; `@svml/hyperframes` is its implementation.

`TimedCaptionProjection` belongs to `@svml/caption`, not to a global contract module.

These logical modules may initially ship together in one physical `@svml/video` npm distribution.
Their independent Manifest identities are more important than their physical package count.

## 5. Official video components

| Module | Owns | Explicitly does not own |
|---|---|---|
| `@svml/script` | official Script syntax to Narrative | timing, LLM correction, caption style |
| `@svml/seedance` | author-visible Seedance model requirements and lowering | KIE/Volcengine credentials or routing |
| `@svml/whisperx` | WhisperX Capability, provider-specific response Type and normalization | endpoint deployment or queue |
| `@svml/speech-align` | Narrative + Evidence + SpeechBasis alignment algorithm | WhisperX API |
| `@svml/caption` | caption projection, cue/style Programs and VisualTrack lowering | Composition privilege |
| `@svml/broll` | B-roll Programs, owned motion/transitions and peer Tracks | mutation of sibling Tracks |
| `@svml/text-track` | editorial text Programs and VisualTrack lowering | markup Frontend |
| `@svml/film` | arbitrary Track assembly into Composition | HyperFrames compilation or rendering |
| `@svml/hyperframes` | HyperFrames Visual IR implementation; Composition to HyperframesDocument | protocol ownership, Film semantics or render deployment |
| `@svml/speech-program` | official reusable speech pipeline composition | universal video workflow |

The current `@svml/video-fragments` package is a prototype of `@svml/speech-program`, not a public
generic extension point. The current Film-to-HyperFrames edge must move out of `@svml/film`.

`@svml/prelude` may later provide a convenient author-only aggregate of common official modules.
Prelude is ordinary transitive module composition: it has no Core, filesystem, network or Runtime
privilege.

## 6. Package facets and activation

A physical package may carry multiple facets, but a Host activates each facet independently:

```text
static
  Module Manifests
  package identity and implementation byte digests

author
  Frontends
  Surfaces
  Graph Fragments

compute
  Producer implementations
  Type Validators

provider
  Provider Endpoints

runtime
  Scheduler/store/dispatcher implementations
```

Source `<import>` activates only a declared author module in the Source Closure. It never grants
network, credential, process, store or queue access. Installed code becomes executable only after
the Host resolves a lock, verifies implementation bytes, checks an allowlist and grants the facet's
declared permissions.

The implemented trusted Node facet loader is named `@svml/package-loader-node`. It loads already
installed packages; it is not an npm client and does not install packages because a source file
requested them. One implementation lock covers physical declared-dependency bytes plus Module,
Frontend, Text Surface, Producer and Type Validator identities. The Compiler and compute Host grant
different registries from the same verified activation; Provider/Runtime authority is absent.

The package descriptor and lock must bind:

```text
physical package artifact digest
every exported Module Manifest digest
every Frontend/Surface/Producer/Validator implementation digest
every privileged Provider/Runtime facet digest and permission declaration
```

Development `digestOf("implementation-name@version")` labels are interpreted only inside the exact
physical package closure that the implementation lock binds. Release-built facet identities remain
future work, but a locked Host will not accept the same Build under different package bytes.

### 6.1 Three locks, three questions

The system must not use one overloaded `svml.lock` to answer unrelated questions:

| Lock | Answers | Contains no |
|---|---|---|
| Source/Module Lock | which exact author modules and Manifest digests interpret this source | credentials, queue or database configuration |
| Package/Implementation Lock | which installed artifact bytes implement locked Frontends, Surfaces, Producers and Validators | account instances or author Targets |
| Runtime Closure Lock | which Scheduler, stores, dispatchers and Provider implementation digests are permitted for this Run | raw secrets or author meaning |

`BuildRequest.digest` identifies Targets and Candidate bindings and, for locked execution, carries
`implementationClosure = packageLock.digest`. Runtime Profile is editable configuration; Runtime
Closure is its resolved, digest-locked privileged-service form.

### 6.2 Source Assets are dependencies, not parser authority

An author file may name a local image, video, audio file, font or other package-defined asset. That
does not grant its Surface filesystem access. The division is:

```text
Surface                 declares { from, exact mediaType }
Workspace session       resolves under its own authority and locks observations
Source Closure          binds written locator + BlobRef
Host transfer bundle    carries defensive bytes outside Core state
Runtime build ingress   verifies and stages bytes into its ArtifactStore
```

`check` and `plan` resolve identities so their result is reproducible, but they do not write the
Runtime store. `build` performs explicit ingress. Core sees only ordinary authored Records whose
values may contain BlobRefs; it never sees paths, open handles, transfer bytes or staging policy.
The same ABI therefore works for a local filesystem, browser upload, repository object or remote
compiler without teaching any author package about that environment. `@svml/host` defines this
small contract; `@svml/workspace-fs-node` is only the convenient Node implementation. Selecting a
Workspace is Host configuration, never author syntax or a module import.

## 7. Endpoint and provider naming

Author method and execution endpoint are different namespaces.

```text
@svml/seedance           author selects Seedance and model
@svml/provider-kie       KIE credentials, API and polling
@svml/provider-volcengine
@svml/provider-fal
@svml/provider-google
@svml/provider-whisperx-local    local/reference WhisperX execution
@svml/provider-whisperx-aws      our WhisperX Lambda/coordinator implementation
@svml/provider-hyperframes-local local/reference rendering
@svml/provider-hyperframes-aws   our Lambda rendering implementation
@svml/provider-media-local       local ffprobe/ffmpeg inspection and normalization
@svml/provider-media-aws         future equivalent Media Pipeline Lambda implementation
@hypit/svml-provider     Hypit endpoints for several exact capabilities
```

Endpoint packages are organized by the actual service or execution backend, not by every model.
One KIE package may expose several exact capabilities. Runtime Profile binding chooses an Endpoint
instance for an already explicit Need; it never decides whether author intent meant Seedance,
Kling or another method.

`provider-*` is a legitimate distribution name only when a real supplier/service is the organizing
identity, such as KIE. The current local WhisperX, media and HyperFrames package names retain the
prototype prefix temporarily; their framework ABI is already the neutral `@svml/endpoint-kit`.

An Endpoint instance id identifies account and deployment configuration:

```text
kie.personal
volcengine.brand-production
hypit.customer-tenant
whisperx.local-gpu
```

Accounts and tenants do not produce new package names.

Transport libraries sit below Endpoint packages and never appear in Endpoint Binding:

```text
@svml/transport-aws-lambda   bounded synchronous JSON invocation
@svml/transport-process      bounded shell-free local JSON invocation
```

For example, `provider-whisperx-aws` may depend on `transport-aws-lambda`, but only the former owns
the WhisperX capability, request schema, checkpoint interpretation and result validation.

## 8. Runtime service vocabulary

The environment-neutral Runtime layer should expose ports with these exact responsibilities.

| Port | Required? | Owns | Does not own |
|---|---:|---|---|
| `BuildScheduler` | yes | asks Core for ready Commands; concurrency, fairness, cancellation and retry policy | Graph search or next-step semantics |
| `BuildStore` | durable Runtime only | verified BuildState snapshots/events and optimistic concurrency | Endpoint checkpoints or artifact bytes |
| `OperationStore` | whenever side effects may outlive one call | attempts, submission keys, checkpoints, reconciliation and completion per Command | Core BuildState facts |
| `ArtifactStore` | whenever Blob values exist | content-addressed bytes and media metadata | Result reuse policy or author library semantics |
| `ResultCache` | optional | execution-key to previously verified result/Receipt mappings | implicit Candidate selection |
| `RecordCatalog` | optional | searchable prior/uploaded/manual TypedRecords and provenance for explicit Existing-Value Candidates | automatic Pin or Build graph mutation |
| `CredentialStore` | when privileged Endpoints exist | scoped secret lookup by configured credential reference | secrets in source, lock or BuildState |
| `CommandDispatcher` | distributed Runtime only | delivery of Scheduler-authorized Commands to executors | scheduling authority or dependency calculation |
| `ObservabilitySink` | optional | logs, traces and metrics | facts required to verify a Build |

The interface names above do not imply one package, process, database or table per port. One trusted
adapter may implement several ports while declaring each facet separately.

The implemented `RuntimeServicePackage` is the common installation envelope for Scheduler,
BuildStore, OperationStore, ArtifactStore and CredentialStore values. It binds each configured
instance to one exact static Manifest facet and non-secret configuration digest. A physical SQLite
package may therefore expose two separately selected logical services and one shared close
lifecycle. Runtime selection—not source imports and not package code—chooses the active instance.

### 8.1 BuildStore versus OperationStore

This distinction is mandatory:

```text
BuildStore
  stores what Core has accepted

OperationStore
  stores what the Runtime is attempting in the outside world
```

A Seedance submit may be pending or uncertain without becoming an accepted Core Event. That state
belongs to OperationStore. Only a completed, validated fulfillment enters BuildState.

### 8.2 ArtifactStore versus ResultCache versus RecordCatalog

They answer different questions:

```text
ArtifactStore  “Which bytes have digest X?”
ResultCache    “Has this exact execution already produced a reusable result?”
RecordCatalog  “Which prior values may the user explicitly attach and select?”
```

Pin/reuse does not require a database. A Host may create one provided Candidate directly from a
file or Record. A catalog is needed only for history, search and product UX.

### 8.3 Hosted product services outside the reusable Runtime protocol

A Hosted product still needs services that are real but do not define SVML compilation semantics:

| Service | Placement |
|---|---|
| authentication and session management | embedding product/API gateway |
| tenant membership and authorization | embedding product policy |
| quota and billing rules | Scheduler policy input and Receipt/Operation consumers |
| notifications and webhooks | read-only Build/Operation observers |
| package marketplace/registry | distribution infrastructure used before Package Activation |
| artifact retention and garbage collection | deployment policy over ArtifactStore references |
| dashboards and search indices | product projections over BuildStore/RecordCatalog |

They may be implemented by Hypit packages and databases, but they must not generate Core Commands,
rewrite BuildState, select author Candidates or become required by the open-source local Runtime.
The reusable Runtime may expose narrow policy/observer hooks without standardizing Hypit's product
tables or business rules.

## 9. Queue vocabulary

There is no universal `@svml/queue` package.

### 9.1 BuildScheduler is the sole authority

One Build has exactly one BuildScheduler. It obtains ready Commands from Core and owns concurrency
lanes, fairness and cancellation. An in-memory ready list inside a local Scheduler is not a second
architectural service.

### 9.2 CommandDispatcher is optional transport

A distributed Hosted Runtime may put already-authorized Commands onto a transport for workers:

```text
Core -> BuildScheduler -> CommandDispatcher -> Executor -> Event -> Core
```

The dispatcher cannot discover dependencies, choose Candidates, change a Need or accept Events.
Possible backend packages, only when actually required, use names such as:

```text
@hypit/command-dispatch-sqs
@hypit/command-dispatch-redis
```

They are transports behind `CommandDispatcher`, not Build schedulers.

### 9.3 External job systems are Endpoint internals

KIE, Volcengine, Fal, HyperFrames Lambda or Hypit may have submit/poll/webhook queues. Those queues
are private implementation details of the Endpoint and OperationStore reconciliation.
They are not registered as SVML queues and never advance the Build graph.

Therefore the local reference Runtime needs no message queue. Hosted deployment may have a command
dispatch transport and many Endpoint-internal job systems while still having exactly one Build
Scheduler per Build.

## 10. Storage implementations and database ownership

Role-first interface names and backend-specific distribution names should be used.

Reference local implementations may be delivered as:

```text
@svml/store-sqlite
  facets: BuildStore, OperationStore, ResultCache, optional RecordCatalog

@svml/artifact-store-fs
@svml/artifact-store-s3
@svml/credential-store-env
@svml/credential-store-keychain   optional production local adapter
```

An all-file development profile may instead use BuildStore and OperationStore JSON adapters. No
database is required by Core.

Hosted implementations may be delivered as internal packages:

```text
@hypit/svml-store-postgres
@svml/artifact-store-s3 configured for a Hypit bucket/namespace
@hypit/credential-store
```

Each storage adapter owns its private schema and migrations. Runtime ports define behavior, not SQL
tables. A single Postgres database may back several ports with namespaced tables and transactions;
that does not merge their semantic responsibilities.

BuildStore uses compare-and-swap or equivalent revision control so two Scheduler replicas cannot
accept conflicting transitions. OperationStore owns attempt leases and idempotency keys for
distributed executors. These are storage implementation obligations, not additional Core concepts.
Artifact retention/GC must treat referenced Build records, cached results and catalog entries as
roots; deletion policy remains outside author semantics.

Upgrade rules:

1. Core never knows adapter tables or runs their migrations.
2. Updating a storage adapter runs only that adapter's versioned migrations.
3. A BuildState wire-format change is a Protocol compatibility event, not an incidental database
   migration.
4. Package updates restart only processes that load changed executable facets; a Core library does
   not need republishing because a Provider or store adapter changed.
5. Credentials and raw secrets never enter migrations, locks, BuildState or source.

## 11. Runtime Profile, Runtime Closure and distributions

A Runtime Profile is user/deployment configuration, not author intent. It selects implementations
and instances:

```yaml
runtime: node
stores:
  build: sqlite.workspace
  operations: sqlite.workspace
  artifacts: artifacts.project
  cache: sqlite.workspace
  catalog: sqlite.workspace
credentials: keychain.user
endpoints:
  seedance.mini.speech-video@1: kie.personal
  whisperx.alignment@1: whisperx.local-gpu
  hyperframes.render@1: hyperframes.local
```

The resolved Runtime Closure locks implementation and permission digests. Environment values,
credential material, queue names and database URLs do not enter author `semanticDigest`; executed
implementation identities and results do enter Run provenance.

Recommended distributions:

```text
@svml/local
  reference local assembly: Scheduler + SQLite Build/Operation stores + filesystem artifacts
  + environment credentials

@hypit/svml-client
  thin client that submits a complete locked Build to Hosted Runtime

@hypit/runtime-server
  internal Hosted assembly, not installed by ordinary video authors
```

A distribution reduces installation and configuration work. It does not erase the internal port or
trust boundaries.

## 12. Dependency laws

1. `protocol` and `core` never import domain, Frontend, Endpoint, store or queue packages.
2. `compiler` never imports Runtime services or capability Endpoints.
3. `runtime` and its stores never import official video modules.
4. Domain components depend on the smallest logical type-owner modules they consume, not a global
   contracts digest.
5. Composition owns the HyperFrames Visual IR schema but does not depend on the
   `@svml/hyperframes` implementation package; Film does not depend on that implementation either.
6. Source imports cannot activate Endpoint, store, credential, dispatcher or worker facets.
7. ResultCache and RecordCatalog cannot silently alter Candidate selection.
8. Endpoint packages match exact CapabilityRef and return TypeRef; equal return shape is not routing
   authority.
9. Store and queue adapters cannot generate Core Commands or accept Build Events.
10. Prelude and Distribution are convenience aggregates, never privileged semantics.

## 13. Current deviations and migration order

The present repository intentionally still has several prototype physical package names. The
completed and partial steps below distinguish API laws from unfinished distribution cleanup:

1. **completed:** static Manifest parsing preserves Producer/Need affinity across JSON loading and
   pure parsing lives in Protocol while Node filesystem loading remains in the Driver;
2. **completed:** register Type-owner validators and route authored, provided, Producer and Endpoint
   values through the same Admission path;
3. **completed:** the physical `@svml/contracts` distribution carries independently digested
   Narrative, Media, ProgramSpace, Speech, SemanticTime and Composition logical modules;
4. **completed:** Film stops at Composition and the generic `video-fragments` package has become the
   explicit `speech-program` composition;
5. atomically rename `elaborator`, `realization`, `validation`, `driver-node` and `text` at the
   package API boundary;
6. **completed for the one-process reference:** `@svml/runtime` owns executor, ArtifactStore,
   BuildStore and OperationStore ports; static
   Runtime facets; sealed Profile/Closure resolution; in-memory CAS stores; and one queue-free
   multi-Build Scheduler with shared concurrency lanes. Its generic Runtime service-package ABI
   installs Scheduler and Store implementations without `@svml/local` knowing their package names.
   The reference recoverable Endpoint
   start/resume lifecycle is complete. `@svml/store-sqlite`, `@svml/artifact-store-fs` and
   `@svml/local` now provide durable project recovery and package-based local assembly; distributed
   leases and wake-up polling remain;
7. **completed for trusted in-process packages:** `@svml/package-loader-node` locks the full physical
   declared-dependency closure and activates Module, Frontend, Text Surface, Producer and Type
   Validator facets without package-specific CLI or local Runtime registration;
   `@svml/component-kit` exposes enumerable host-neutral compute facets and BuildRequest binds the
   implementation closure. Untrusted isolation remains;
8. **partially completed:** add real capability Endpoints; KIE generation, reference local media,
   local HyperFrames, the local WhisperX Endpoint and its locked Python service are implemented,
   while AWS/hosted equivalents remain;
9. add Hosted CommandDispatcher and durable server adapters only when a real multi-process Runtime
   requires them.

This order prevents the loader, database schema and hosted deployment from freezing accidental
prototype package boundaries.
