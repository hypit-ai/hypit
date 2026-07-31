# SVML

Semantic Video Markup Language is a semantic source language for information-flow
video. Script creates stable semantic addresses; a Composition selects one
content-addressed ProgramBasis and one imported Locator Component whose SemanticMap
binds those addresses to that basis; Track Components then lower the program into
one deterministic HyperFrames document.

```text
.svml + .svc + .svs + .svk + lock + evidence
                         │
                         ├─ Plan IR ─────────────────────> Canvas view
                         ├─ Basis + SemanticMap ─────────> TemporalBinding
                         ├─ TemporalBinding ─────────────> Timeline view
                         └─ flat Track[] ────────────────> HyperFrames HTML
```

Canvas and Timeline are views of the same source closure. They are not additional
authoring truths. Provider tasks, pins, takes and caches are runtime state and do
not enter the source language.

## Current prototype

The repository contains a strict TypeScript compiler and an intentionally small
stdlib. The deterministic slice is working end to end:

- frozen Script Surface with dialogue, speech and caption projections;
- closed, possibly disconnected Selection sets and zero-width Moments;
- `.svc` content modules and typed `.svs` parameter classes;
- stable Plan identities, separate execution digests and a verified `svml.lock`;
- isolated `.svk` component lowering with scoped CSS and a JSON-only ABI;
- typed `.svk` ports, parameters and recursive child-content schemas;
- manifest-enforced temporal `one` / `each` / `set` consumption;
- a Speech Spine compatibility component, media/presentation mapping, ranking, B-roll,
  captions, text and audio;
- frame-exact Located IR, Canvas/Timeline views and HyperFrames HTML.

The current runtime deliberately has no live generation provider host. A
`profile="capability-v1"` Component remains visible in Plan, but compilation requires
an exact, content-verified `svml.artifacts.v1` binding for its outputs and never
falls back to a provider call. Direct existing `Image`, `Video` and `Audio` values
work as usual. This keeps the first end-to-end reference deterministic while
preserving the eventual capability boundary.

The executable prototype still implements frozen Script Surface v1: one globally
monotonic Speech Spine alignment with shared adjacent Segment cuts. The architecture
draft and Script Surface v2 draft specify the next boundary: a replaceable Basis
Component, an importable Locator Component that outputs SemanticMap, and `2M + 2N`
independent Segment/word endpoint identities. The repository does not claim that
migration is implemented.

## Commands

Requires Node.js 22 and pnpm.

```bash
pnpm install
pnpm check
pnpm test
pnpm build

pnpm svml check examples/regen-ranking/regen-ranking.svml
pnpm svml fmt examples/regen-ranking/regen-ranking.svml --check
pnpm svml canvas examples/regen-ranking/regen-ranking.svml --out canvas.json
pnpm svml estimate examples/regen-ranking/regen-ranking.svml \
  --out estimated-alignment.json
pnpm svml timeline examples/regen-ranking/regen-ranking.svml \
  --evidence examples/regen-ranking/evidence/alignment.json \
  --out timeline.json
pnpm svml lock examples/regen-ranking/regen-ranking.svml --out svml.lock
pnpm svml compile examples/regen-ranking/regen-ranking.svml \
  --evidence examples/regen-ranking/evidence/alignment.json \
  --lock svml.lock \
  --out build/index.html
pnpm svml render build/index.html --out build/video.mp4
```

`--artifacts` is needed only when the reachable Plan contains capability Components.
`fmt` currently canonicalizes only the frozen Script body and refuses any rewrite
whose reparsed semantic IR differs.
`canvas` requires no timing or provider result. `estimate` deterministically
creates provisional syllable-based alignment; `timeline` and `compile` consume
either that preview evidence or measured Speech Spine evidence. The current
prototype verifies source closure and bound capability artifacts. It does not yet
claim complete temporal reproducibility because Evidence, Locator, ProgramBasis and
SemanticMap digests are not all part of the executable lock path.

## Reference implementation

[`examples/regen-ranking/regen-ranking.svml`](examples/regen-ranking/regen-ranking.svml)
reconstructs a real production video containing the Speech Spine compatibility component,
a five-item ranking track, five B-roll items, captions, title, music and sound effects. The media files
are intentionally gitignored; their production provenance and frozen assertions
are recorded in
[`examples/regen-ranking/reference.json`](examples/regen-ranking/reference.json).
The regression test compiles the example to 27 Canvas nodes, 29 typed topology
edges, 1083 frames, 155 visual fragments and 14 audio fragments.
The default syllable estimator predicts 36.267 seconds for the frozen 36.1-second
speech program (0.46% duration error); it remains preview evidence, not measured
alignment.

[`examples/flat-track-launch/flat-track-launch.svml`](examples/flat-track-launch/flat-track-launch.svml)
is the readable fixture for the next architecture boundary: separate Basis and
Locator Components, Script Surface v2, continuous A-roll Present changes, B-roll
transition audio, disconnected caption selections, absolute z and Film as the sole
`Track[]` consumer. It is a draft fixture, not yet accepted by the executable v1
compiler.

## Specification

- [Script Surface v1](spec/script-surface-v1.md) — the frozen, human-readable
  source language for narrative, text projections, selections, and moments.
- [Script Surface v2 draft](spec/script-surface-v2-draft.md) — the syntax-preserving
  independent Segment endpoint and `2M + 2N` migration.
- [Source Architecture Draft](spec/source-architecture-draft.md) — the current
  draft for `.svk` components, `.svs` parameter sheets, `.svc` content modules,
  Script-dependent generation, the five SVK output roles, flat Tracks, and a
  Composition root.
- [Compiler prototype record](docs/compiler-prototype-v1.md) — implemented
  boundaries, real-video evidence and remaining work.
- [External Runtime Host Architecture Draft](docs/runtime-host-architecture-draft.md)
  — portable runtime, Artifact, Effect/Receipt, Worker, queue, provider and
  self-hosting boundaries; TemporalBasisProduction acquisition remains
  intentionally deferred.
