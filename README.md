# SVML

> **v2 bootstrap:** `packages/protocol`, `packages/core` and `packages/driver-node`
> implement the domain-free typed state kernel and an explicitly registered Node Host.
> `packages/text` and `packages/script` now implement the first official authoring vertical:
> a minimal Text Frontend that learns raw/structured Surfaces from locked module manifests, plus
> an ordinary Script Surface package using named Segments such as `<opening>...</opening>`.
> `packages/whisperx` adds a pure, tested one-pass WhisperX timing locator; the Host adapter that
> invokes WhisperX is intentionally still outside this slice. Third-party parser sandboxing,
> source imports and `.svs` are not implemented yet. The existing
> root compiler and standard library remain the executable v1 research oracle during migration.

Semantic Video Markup Language is a semantic source language for information-flow
video. Script creates stable semantic addresses. A Composition selects one
content-addressed `ProgramBasis` and one exact `SemanticMap`; flat Track
Components then lower every audiovisual contribution into one deterministic
HyperFrames HTML document.

```text
.svml + transitive .svk/.svs/.svc imports + lock + evidence
        │
        ├─ typed Plan IR ─────────────────────────────> Canvas view
        ├─ Basis Producer ─────> TemporalBasisProduction
        ├─ Locator ────────────> CompleteSemanticMap
        ├─ Basis + Map ────────> TemporalBinding ─────> Timeline view
        └─ flat Track[] ───────> Composition ─────────> HyperFrames HTML
```

Canvas and Timeline are views of the same source closure, not additional
authoring truths. Provider tasks, pins, takes, caches and queue state belong to a
Runtime Host and do not enter the source language.

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
- Film as the only `Track[]` consumer and HyperFrames HTML as the sole formal
  video compilation target.

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

## Specification and implementation record

- [Intent-first modular compilation architecture](docs/intent-first-modular-compilation.md)
  records the next architecture direction: SVML as author intent, source-selected
  SVK compilation components, typed external requirements and provenance-preserving
  fulfillment or substitution. The executable v1 documents below remain implementation
  records until that migration is complete.
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
