# SVML

Semantic Video Markup Language is a semantic source language for information-flow
video. Script creates stable semantic addresses; a Composition-selected Temporal
Producer binds every Segment and word endpoint to one ProgramBasis; ordinary
imported Kernels project the resulting media graph to one deterministic HyperFrames
document.

```text
.svml + .svc + .svs + .svk + lock + evidence
                         │
                         ├─ Plan IR ────────> Canvas view
                         ├─ Located IR ─────> Timeline view
                         └─ HyperFrames HTML ──> rendered video
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
- isolated `.svk` projectors with scoped CSS and a JSON-only ABI;
- typed `.svk` ports, parameters and recursive child-content schemas;
- manifest-enforced temporal `one` / `each` / `set` consumption;
- a Speech Spine reference producer, media/presentation mapping, ranking, B-roll,
  captions, text and audio;
- frame-exact Located IR, Canvas/Timeline views and HyperFrames HTML.

The current runtime deliberately has no live generation provider host. A
`profile="capability-v1"` Kernel remains visible in Plan, but compilation requires
an exact, content-verified `svml.artifacts.v1` binding for its outputs and never
falls back to a provider call. Direct existing `Image`, `Video` and `Audio` values
work as usual. This keeps the first end-to-end reference deterministic while
preserving the eventual capability boundary.

The executable prototype still models temporal evidence as one globally monotonic
Speech Spine alignment with shared adjacent Segment cuts. The current architecture
draft supersedes that restriction with a duck-typed `TemporalProduction` contract
and `2M + 2N` independent Segment/word endpoint identities. That migration is an
explicit implementation boundary; the repository does not claim it is already
implemented.

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

`--artifacts` is needed only when the reachable Plan contains capability Kernels.
`fmt` currently canonicalizes only the frozen Script body and refuses any rewrite
whose reparsed semantic IR differs.
`canvas` requires no timing or provider result. `estimate` deterministically
creates provisional syllable-based alignment; `timeline` and `compile` consume
either that preview evidence or measured Speech Spine evidence. A compile is
marked reproducible only when its exact
module/Kernel/material closure matches the lock and every reachable capability
output has been content-verified.

## Reference implementation

[`examples/regen-ranking/regen-ranking.svml`](examples/regen-ranking/regen-ranking.svml)
reconstructs a real production video containing the Speech Spine reference producer,
a five-item ranking track, five B-roll items, captions, title, music and sound effects. The media files
are intentionally gitignored; their production provenance and frozen assertions
are recorded in
[`examples/regen-ranking/reference.json`](examples/regen-ranking/reference.json).
The regression test compiles the example to 27 Canvas nodes, 29 typed topology
edges, 1083 frames, 155 visual fragments and 14 audio fragments.
The default syllable estimator predicts 36.267 seconds for the frozen 36.1-second
speech program (0.46% duration error); it remains preview evidence, not measured
alignment.

## Specification

- [Script Surface v1](spec/script-surface-v1.md) — the frozen, human-readable
  source language for narrative, text projections, selections, and moments.
- [Source Architecture Draft](spec/source-architecture-draft.md) — the current
  draft for `.svk` components, `.svs` parameter sheets, `.svc` content modules,
  Script-dependent generation, Temporal Producers, Tracks, and a Composition root.
- [Compiler prototype record](docs/compiler-prototype-v1.md) — implemented
  boundaries, real-video evidence and remaining work.
- [External Runtime Host Architecture Draft](docs/runtime-host-architecture-draft.md)
  — portable runtime, Artifact, Effect/Receipt, Worker, queue, provider and
  self-hosting boundaries; TemporalProduction acquisition remains
  intentionally deferred.
