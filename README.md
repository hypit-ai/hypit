# SVML

> **v2 bootstrap:** `packages/protocol`, `packages/core` and `packages/driver-node`
> implement the domain-free `LogicalOutput / Candidate / Operation / Target` kernel and an explicitly
> registered Node Host. A single Build Compiler resolves each demanded Logical Output, selects its
> Candidate from a `BuildRequest`, and memoizes the reverse closure by stable `OperationId` before the
> Build Machine executes anything. Reuse and product-level “Pin” UI actions are ordinary
> Existing-Value Candidates, not Core branches; Providers only execute already selected exact
> CapabilityRefs. Declarative affinity compares intrinsic identities such as ProgramSpace and the
> exact acoustic Blob; dependency and provenance truth stay in Graph, Derivation and Receipt.
> `packages/speech-take` proves atomic Product plus ordinary audio/visual Projection;
> `packages/elaborator` now links parser-independent Author Modules in two phases—predeclaring every
> component output before resolving forward references—and expands content-addressed static
> Fragments with hygienic instance identities;
> `packages/realization` attaches locked Existing-Value or Fragment Candidates without changing the
> author graph identity. These are executable reference layers outside Core, not new Kernel magic.
> `packages/speech-program` now composes the first real speech vertical from static Fragments:
> SpeechTake projections, one-pass WhisperX evidence, a provider-neutral SemanticMap and timed
> captions. Producer-declared affinity protects internal Fragment results before they enter state;
> Logical-Output affinity separately protects selected Candidates.
> `packages/broll` lowers provider-neutral B-roll Programs into independently stacked visual
> Presents and ordinary source-audio/SFX tracks. Local pop/fade/slide motion and push/page-turn
> handoffs stay package-owned; neither Composition nor HyperFrames learns what B-roll means.
> `packages/text-track` lowers persistent or timed editorial text into the same peer VisualTrack
> contract. `packages/film` folds any number of visual/audio Track references into Composition
> through ordinary fixed-port Operations; Film remains an optional Target and does not become a
> Core root. `packages/hyperframes-render` separately turns any Composition into an explicit exact
> render Need and a final MediaArtifact projection.
> The v2 composition waist is intentionally flat: captions, text, speech video, B-roll and overlay
> effects must become self-contained peer Tracks. Composition may layer them by time, space and z,
> but no Track may mutate or intersect a sibling Track.
> `packages/text` and `packages/script` now implement the first official authoring vertical:
> a minimal Text Frontend that learns raw/structured Surfaces from locked module manifests, plus
> an ordinary Script Surface package using named Segments such as `<opening>...</opening>`. Text
> Surfaces can now return inert Record, Author Component and Graph Fragment declarations; Text
> collects the complete document before Elaborator resolves forward references into a Core Graph.
> `packages/whisperx` declares the typed one-pass WhisperX Need;
> `packages/provider-whisperx-local` and the independently locked `services/whisperx` Python
> distribution implement the trusted local path. Hosted adapters remain Runtime packages outside
> this slice. `packages/elaborator` now compiles recursive Source Closures,
> while `packages/svs` implements a deliberately generic record-only Recipe Frontend; package-owned
> video Recipe validation remains undecided. `packages/compiler-node` now supplies the domain-free
> registered-manifest resolver, injected Workspace compiler and file-to-Graph/
> BuildPlan facade; `packages/cli` assembles the first trusted Text + Script + SVS + Film + Render
> command-line prelude. `packages/validation` now supplies package-owned semantic Type admission: authored,
> provided, Producer and Endpoint values use the same exact-Type validator gate while Core verifies
> only the locked receipt. `packages/runtime` now supplies the environment-neutral executor and
> BuildStore/OperationStore ports, static Runtime facets, sealed Profile/Closure resolution,
> in-memory CAS, and a queue-free local Scheduler whose concurrency lanes are shared across Builds
> and independent commands inside one Build. Recoverable Endpoints now journal a stable
> submission identity before `start`, persist pending checkpoints, and use `resume` after restart;
> completed operations are replayed into Core without another external call. Trusted installed
> author packages can now be activated from a byte-locked physical dependency closure without
> changing Core or the official CLI; automatic installation, untrusted parser/validator sandboxing,
> distributed leases and hosted WhisperX /
> HyperFrames Endpoint adapters are not implemented yet. The first KIE generation Provider and its
> seven explicit model families are implemented. `@svml/store-sqlite`, `@svml/artifact-store-fs` and
> `@svml/local` now provide the durable zero-service developer assembly.
> `@svml/endpoint-kit` and `@svml/credential-store-env` now bind static Endpoint identity,
> non-secret configuration, exact credential slots and recoverable wake/retry/cancel behavior;
> Runtime service packages now bind Scheduler and Store implementations through the same exact
> Manifest/instance selection law, so `@svml/local` no longer contains package-specific store
> registration;
> `@svml/artifact-store-s3` plus bounded Lambda/process transports provide replaceable external
> execution plumbing without claiming any video capability;
> `@svml/media-pipeline` and `@svml/provider-media-local` now provide all-stream ffprobe inspection,
> attached-picture-safe stream selection and shared-origin A/V normalization. Embedded AAC remains
> an ordinary media fact until an explicit Narrative-bound speech component promotes it;
> the v2 CLI exposes local follow, status and cancel without adding another authoritative queue. The existing
> root compiler and standard library remain the executable v1 research oracle during migration.

`@svml/component-kit` is the narrow compute-host port: deterministic model, media, WhisperX and
HyperFrames packages register Producers without importing `@svml/driver-node`. Their handler
interface provides only typed inputs and value/Need outputs—no ArtifactStore, credentials, network,
queue or store handle. The Node Driver is one implementation of that port; trusted in-process code
is not yet a security sandbox.

The reusable non-video stack is intentionally smaller than the video distribution:
`@svml/protocol + @svml/core` are the irreducible Kernel, `@svml/elaborator` is the normal optional
author-to-Graph compiler, `@svml/compiler-node` is the optional reference file/package-registration
Host, and a Driver/Runtime executes Commands. Text, Realization overlays and all video packages
remain optional. There is no privileged `@svml/author` package or required `.svk` suffix.
If a domain Type declares a semantic validator, the Host additionally uses `@svml/validation` (or
an equivalent implementation); the Type still does not enter Core.

Semantic Video Markup Language is a graph language for semantic, information-flow video. `.svml`
is the pleasant author notation; package Surfaces lower it into peer Logical Outputs, Candidates
and Operations. Script creates stable semantic addresses, while optional Film, Track and render
packages are ordinary graph regions rather than a mandatory one-way compiler pipeline.

```text
                                    ┌─> visual Track ───────────┐
.svml ─> typed Records + Graph ─> Take                           ├─> optional Composition ─> render
          │                         └─> audio ─> evidence ─> Map ─┘
          ├────────────────────────────────────────────> any Map/Track Target
          └─> another independent branch ──────────────> another Target
```

Reverse Demand starts from whichever Targets the user asks for, deduplicates shared Operations and
never grants final Film/render special status. Canvas and Timeline are views of the same source
closure, not additional authoring truths. Provider tasks, reused values, caches and queue state
belong to Graph realization or Runtime state and do not become hidden fields in the author source.

## Implemented v1 slice

The TypeScript compiler and local standard library implement the current v1
architecture end to end:

- readable Script with Role Cues, Dual Text, Slots, closed/disconnected
  Selections and zero-width Moments;
- an exact `SemanticIndex` with independent word and Segment endpoints
  (`2M + 2N` identities);
- replaceable `TemporalBasisProduction` and `CompleteSemanticMap` Components,
  validated and bound before any Track lowering;
- direct monotonic many-to-many alignment from authoritative Script tokens to
  noisy `SpeechTimingEvidence`, without a corrected-transcript stage;
- hard cut, gap and audio/visual crossfade joins with distinct source-to-program
  maps;
- typed `.svc` content modules and `.svs` classes, including nested Component
  fields;
- stable Plan identity, separate execution digests and a full temporal
  `svml.lock`;
- isolated `.svk` projectors, verified offline capability artifacts and finite,
  auditable `composite-v1` expansion;
- manifest-enforced temporal `one` / `each` / `set` consumption;
- a post-locate `CaptionPlan` that may group cues and add typed style annotations
  but cannot rewrite Script text or timing;
- flat media, ranking, B-roll, caption, text and audio Tracks in one absolute
  ProgramSpace;
- Film as the executable v1 slice's `Track[]` consumer and HyperFrames HTML as
  its sole formal video compilation target. The v2 Kernel does not make Film or
  final video the fixed root of every Build.

There is no live provider adapter in this repository. A reachable
`profile="capability-v1"` Component must be satisfied by an exact,
content-verified `svml.artifacts.v1` binding; compilation never falls back to a
provider call. Existing local `Image`, `Video`, `Audio` and Evidence values work
directly.

SVML has not been publicly released. There is no legacy v1 compatibility layer:
the current architecture and Script Surface are the only v1 target.

## Quick start

Requires Node.js 22 and pnpm.

```bash
pnpm install
pnpm check
pnpm test
pnpm build

# Optional local WhisperX Runtime service (Python 3.10–3.13).
uv sync --project services/whisperx --frozen
uv run --project services/whisperx --frozen svml-whisperx-prepare
uv run --project services/whisperx --frozen svml-whisperx-check
uv run --project services/whisperx --frozen svml-whisperx-service

# v2: real Source Closure check through the trusted Text + Script + SVS prelude.
pnpm svml:v2 check examples/v2-bootstrap/main.svml

# v2: explicitly trust and activate an installed third-party author package.
pnpm svml:v2 lock-packages ./svml.packages.lock --package @example/cards --root .
pnpm svml:v2 check ./main.svml --package-lock ./svml.packages.lock --root .

pnpm svml check examples/regen-ranking/regen-ranking.svml
pnpm svml script examples/regen-ranking/regen-ranking.svml --out narrative.json
pnpm svml plan examples/regen-ranking/regen-ranking.svml --out plan.json
pnpm svml canvas examples/regen-ranking/regen-ranking.svml --out canvas.json
pnpm svml estimate examples/regen-ranking/regen-ranking.svml --out estimate.json
pnpm svml timeline examples/regen-ranking/regen-ranking.svml --out timeline.json

# Produce a full frozen lock, including the selected Basis, Map and Evidence.
pnpm svml lock examples/regen-ranking/regen-ranking.svml --out svml.lock

pnpm svml compile examples/regen-ranking/regen-ranking.svml \
  --lock svml.lock \
  --out build/index.html
pnpm svml render build/index.html --out build/video.mp4
```

`--artifacts` is required only when the reachable Plan contains capability
Components. Speech timing is an explicit typed value referenced by the Locator
in source; it is not an ambient CLI argument. `estimate` produces estimated
timing evidence and the same structurally complete `CompleteSemanticMap` type;
per-anchor quality records what was measured, derived or estimated.

`fmt` currently canonicalizes only the Script body and refuses a rewrite if the
reparsed semantic IR differs. `canvas` needs no materialized time evidence.
`timeline`, `compile` and `lock` execute the deterministic local Plan and validate
the selected Basis/Map pair.

## Four source files

| Suffix | Responsibility |
|---|---|
| `.svml` | One film's Script, local values, Component calls, Tracks and Composition |
| `.svk` | An importable Component vocabulary, public typed ABI and lowering |
| `.svs` | Typed parameter classes for public Component parameters and fields |
| `.svc` | Context-free reusable content values and content subgraphs |

The compiler owns universal language laws. Libraries own replaceable vocabulary
and algorithms. A Runtime Host owns effects, credentials, queues and storage.
Canvas owns only a human-readable view.

## Executable examples

- [`examples/regen-ranking/regen-ranking.svml`](examples/regen-ranking/regen-ranking.svml)
  reconstructs a pinned production video with five ranking items, five B-roll
  items, captions, title, BGM and sound effects. It compiles to 30 Plan nodes,
  35 typed edges and 1083 frames.
- [`examples/flat-track-launch/flat-track-launch.svml`](examples/flat-track-launch/flat-track-launch.svml)
  is the comprehensive language fixture: explicit Basis/Locator, nested SVS,
  overlapping Presents, manual ProgramSpans, a Moment, B-roll source audio and
  transition SFX, disconnected caption styling and absolute z.
- [`examples/composite-speech-program/minimal.svml`](examples/composite-speech-program/minimal.svml)
  proves that an author-facing `speech-program` can hide repetitive wiring while
  expanding to separately auditable `voice::basis` and `voice::locator`
  instances. The compiler has no special knowledge of that Component name.
- [`examples/media-basis`](test/fixtures/media-basis) proves that precomposed
  media can implement the same Basis contract and reuse the same Locator and
  Composition path.

The local media used by the examples are already-materialized artifacts; no
generation provider is invoked by tests or compilation.

## v2 authoring target

[`examples/talking-film-golden`](examples/talking-film-golden/README.md) preserves the implemented
Script Surface and specifies the complete namespaced author experience for two Seedance Mini speech
takes, Seedance B-roll, explicit WhisperX alignment, two speaker caption styles, editorial text,
peer Tracks, Film and Hyperframes rendering. Its README marks every implemented and missing lowering;
Script, authored Image, Seedance generation, Film and Render are accepted by the current compiler,
while Speech assembly and Track Surfaces remain the next target.

## Specification and implementation record

Start with the [documentation map](docs/README.md) and
[current implementation status](docs/implementation-status.md). In particular, long architecture
records preserve rejected models and are not all normative.

- [Core Kernel v1](spec/core-kernel-v1.md) is the compact normative `@1` Kernel contract.
- [Intent-first modular compilation architecture](docs/intent-first-modular-compilation.md)
  records the next architecture direction: SVML as author intent, source-selected
  compilation modules, typed external requirements and provenance-preserving
  fulfillment or substitution. The executable v1 documents below remain implementation
  records until that migration is complete.
- [Kernel graph and build intent v2](docs/kernel-graph-build-intent-v2.md)
  is the superseded `@0` Graph/Pin construction record.
- [Logical Output, Candidate, Build Compiler and Graph Fragment v2](docs/logical-output-realization-fragment-draft.md)
  is the current `@1` Kernel construction authority and implementation record.
- [Script Surface v1](spec/script-surface-v1.md)
- [Source Architecture v1 draft](spec/source-architecture-draft.md)
- [Speech Program and Caption v1 target contract](docs/speech-program-caption-v1.md)
- [Compiler implementation record](docs/compiler-prototype.md)
- [External Runtime Host architecture](docs/runtime-host-architecture-draft.md)
  is a historical pre-v2 audit record.
- [Runtime, package and execution topology v2](docs/runtime-package-topology-v2.md)
  specifies the current package, Runtime Profile, Provider Binding and scheduler
  boundaries.

VLM, bbox, face tracking and visual reverse-location are intentionally outside
SVML v1. They may be implemented later as explicit post-processing extensions;
the semantic audio timeline remains the language's locating foundation.
