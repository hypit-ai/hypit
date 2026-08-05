# SVML v1 compiler implementation record

Date: 2026-08-01

This historical implementation record describes the executable v1 research slice. SVML has not been publicly
released; the removed shared-cut Speech Spine prototype is not a compatibility
contract. The implementation targets `spec/script-surface-v1.md` and
`spec/source-architecture-draft.md` directly.

## Outcome

One source closure deterministically produces all author and output views:

```text
check/plan  → svml.plan.v1
canvas      → svml.canvas-view.v1
estimate    → estimated SpeechTimingEvidence → CompleteSemanticMap
timeline    → TemporalBinding → svml.timeline-view.v1
compile     → flat Track[] → svml.hyperframes-document.v1 → HTML
render      → HyperFrames browser recording → MP4
```

The compiler has no branches for `speech-assemble`, `speech-locator`,
`media-track`, `ranking-column`, `broll-track`, `caption-track` or `film`.
Those names are imported Components. Privileged compiler concepts stop at source
parsing, Script/SemanticIndex, typed Plan and reachability, Basis/Map validation,
TemporalBinding, Component ABI isolation, flat Track validation, lock/digests and
the HyperFrames target ABI.

## Architecture contracts implemented

### Script and time

- exactly one readable Script and one ordered Narrative IR;
- Role Cues, three text projections, Dual Text, literal-only Slots and source
  ranges;
- closed, crossing and disconnected Selections plus left/right-affine Moments;
- independent start/end identities for every token and Segment;
- canonical `2M + 2N` SemanticIndex ordering and digest;
- `CompleteSemanticMap` is the single public Map type; anchor quality records
  measured, derived or estimated evidence;
- complete Maps cover every identity, bind one `basisDigest`, preserve per-Segment
  order and the two cross-Segment monotonic constraints;
- zero/negative resolved Selections fail rather than being repaired by a
  consumer.

### Basis and Locator

- `speech-assemble.svk` emits one validated `TemporalBasisProduction`, program
  audio, alignment subjects, source maps and program-bound visual/audio facets;
- hard cut, gap and overlap are per-boundary author inputs; audio cut/crossfade
  and visual cut/dissolve are independent choices;
- adjacent Segment endpoints may coincide, overlap or have a gap without sharing
  identity;
- `media-basis.svk` proves a precomposed medium can satisfy the same public ABI;
- `speech-locator.svk` explicitly consumes Script, Basis production and typed
  `SpeechTimingEvidence`, then directly aligns noisy units to authoritative
  Script tokens and emits a complete Map;
- N:1, 1:N, incorrect, extra and missing measured units are handled without a
  corrected-transcript or LLM stage;
- a capability-profile Locator can emit the same typed Map through a verified
  Artifact binding;
- Basis outcome identity, production provenance and SemanticMap identity use
  separate digests.

### Source closure and Components

- transitive cycle-checked `.svc` imports and portable module identity;
- typed `.svs` classes with Component default → classes → instance precedence;
- nested public child fields may be styled, while ports/topology stay outside
  SVS;
- whole-attribute references, type/cardinality checking and fan-out;
- stable instance identity independent of line, alias and source position;
- execution digests include implementation, effective parameters and transitive
  material/Artifact hashes;
- `composite-v1` performs finite, non-recursive, typed expansion with stable
  internal ids, explicit exports, expansion digests and lock records;
- only `composite-v1` may expand Plan instances; ordinary projectors cannot
  create hidden calls.

### Isolated lowering and Track/Film

- one restricted VM process per projector with JSON-only I/O;
- no network, DOM, Node builtins, dynamic imports, wall clock or ambient random;
- relative code imports remain inside the locked package root;
- active HTML and unscoped CSS are rejected;
- manifest-declared Selection/Moment `one`, `each` and `set` consumption;
- all Track outputs are flat visual/audio/style arrays with validated half-open
  Program ranges;
- no Component may consume Track except the single reachable Composition root;
- Present ranges intersect their parent Item and retain one source-time mapping;
- same-z overlapping Presents fail, while different z values intentionally
  layer without fake Track copies;
- B-roll can own visual crossfade, source audio and transition SFX in one Track;
- Basis audio, Track audio and visual contributions meet only in Film;
- `caption-planner.svk` runs after Locate and emits only token cues and typed
  annotations; `caption-track.svk` supports Selection, Role, annotation and mute
  scopes without changing Script or SemanticMap;
- each Composition has zero or one `CaptionTrack`;
- Film child order does not determine paint order; emitted HTML sorts visuals by
  absolute `(z, stable id)`.

### Freeze and reproducibility

`svml lock` executes the deterministic local Plan and records:

- source closure and Component manifest/implementation hashes;
- Plan and Composite expansion digests;
- material and capability Artifact hashes;
- basis, production, SemanticIndex, Map, Locator and Evidence digests;
- the complete anchor table and quantization policy;
- ProgramSpace and canonical target digest.

The compiler reports `sourceClosureVerified`, `artifactsVerified`,
`temporalEvidenceVerified`, `lockVerified` and `reproducible` separately. A
source-only lock cannot claim temporal reproducibility. A full frozen lock must
match the complete compile outcome.

## Executable acceptance fixtures

| Fixture | What it proves | Current result |
|---|---|---:|
| Regen Ranking | noisy Timing → Script truth + ranking + B-roll | 30 nodes, 35 edges, 1083 frames, 154 visual, 14 audio |
| Flat Track Launch | complete public v1 author surface | 26 nodes, 31 edges, 1083 frames, 155 visual, 8 audio |
| Composite Speech Program | transparent high-level author component | 1 expansion, 4 instances, 285 frames |
| Media Basis | alternative Basis producer | same Locator/Film ABI, 30 frames |
| Capability Locator | typed complete Map as frozen Artifact | same Map validation path |

The Regen source uses pinned artifacts from production Project
`cmrs0yofw00042tlz2t0ygwaw`, Canvas `cmrx7771b00052ts5koz1yy7e` and Job
`cmrxqbub800012tjoi2ev2u24`. The historical final SHA-256 is
`986c2b4f81381e5c5ab6df3c7b58f8bcc5324f9ae11ce820ed1cd8e5ee74c8b8`.
They were recovered read-only; no Canvas run or media generation was submitted.

The post-refactor browser render produced SHA-256
`8f4aa42ee0fee426abbae9aaca3173a099eb1e8b66bd33b973a6425626a80ec7`:
1080×1920 H.264, 30 fps, exactly 36.1 seconds, with 48 kHz stereo AAC. Its
SpeechTimingEvidence deliberately contains merged, split, incorrect and extra
recognition units; rendered captions still contain the Script wording
`Photoshop Powerful but` and never the noisy `power full but` / `uh` evidence.
Four extracted frames were visually checked across A-roll, ranking, B-roll and
final-state sections.

## Deliberately external or still narrow

The following are not silently approximated by the compiler:

1. Live provider, credential, queue, retry and CAS adapters. Those belong to the
   External Runtime Host. Current capability tests use exact offline Artifact
   bindings only.
2. Package/registry resolution beyond local relative imports and lock records.
3. A lossless whole-document CST formatter. Script formatting is implemented
   conservatively and fails closed when round-trip identity is uncertain.
4. Canvas UI layout and reverse authoring edits. Canvas JSON is a view and
   intentionally contains no authored node coordinates.
5. VLM, bbox, face tracking or visual reverse-location. They are outside the v1
   semantic locating model and may be post-processing extensions.
6. Production browser hosting and recording. The CLI runs the local HyperFrames
   renderer, while deploy/runtime orchestration remains a separate service.

These are product/runtime extensions, not missing alternate authoring truths in
SVML source.
