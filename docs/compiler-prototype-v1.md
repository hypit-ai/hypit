# Compiler prototype v1 record

Date: 2026-07-31

This record describes the first executable slice of the source architecture. It
does not freeze the full architecture draft; the frozen Script syntax remains in
`spec/script-surface-v1.md`.

The slice predates the independent-endpoint Basis/Locator contract. Its implemented
Locate path still assumes globally monotonic words and one shared cut between
adjacent Segments. The current architecture instead requires a selected
`TemporalBasisProduction` plus a separately versioned `ExactSemanticMap` covering
`2M + 2N` identities. That is a declared next implementation boundary, not behavior
already provided by this prototype.

## Outcome

One SVML source closure now deterministically produces all three useful views:

```text
check/plan  → svml.plan.v1
canvas      → svml.canvas-view.v1
timeline    → svml.timeline-view.v1
compile     → svml.hyperframes-document.v1 → HyperFrames HTML
```

The compiler does not contain special branches for `ranking-column`,
`broll-track`, `media-track`, `caption-track` or `film`. Each is an imported
`.svk` manifest plus an isolated projector. The only privileged compiler concepts
in this slice are source parsing, values/references, Script/Locate, the Component ABI,
Plan reachability and the HyperFrames target ABI.

## Real-video acceptance

The acceptance source is `examples/regen-ranking/regen-ranking.svml`. It uses the
exact pinned artifacts from:

- production Project `cmrs0yofw00042tlz2t0ygwaw`;
- Canvas `cmrx7771b00052ts5koz1yy7e`;
- Job `cmrxqbub800012tjoi2ev2u24`;
- frozen final SHA-256
  `986c2b4f81381e5c5ab6df3c7b58f8bcc5324f9ae11ce820ed1cd8e5ee74c8b8`.

The production system was inspected read-only through the public `hypit` CLI.
No Canvas Run and no image/video/audio generation task was submitted. Alignment
evidence was recovered from the already pinned speech audio and the frozen result.

Current deterministic output:

| Contract | Result |
|---|---:|
| Canvas | 27 stable nodes, 29 typed edges |
| Master clock | 1080 × 1920, 30 fps, 1083 frames |
| Timeline | 155 visual fragments, 14 audio fragments |
| Audio parity | APSNR 174.207 / 174.208 dB |
| Visual parity | aggregate SSIM 0.949835 |
| B-roll cuts | reference frame boundaries reproduced |
| Syllable estimate | 36.267 s vs 36.1 s measured (0.46% error) |

The SSIM result compares separate browser/codec rendering paths and is therefore
not expected to be byte-identical. Frame count, program duration, semantic
Selection ranges, B-roll cut frames and audio are asserted independently.

## Implemented contracts

### Source and Script

- exactly one `<script>` per `.svml`;
- CRLF/CR normalization to LF and Unicode NFC;
- canonical Segment and temporal ids;
- East Asian ideographs and kana tokenized individually;
- turn-scoped Role Cues and three text projections;
- Dual Text caption atom mapped to its full speech span;
- closed Selection occurrences, disconnected Selection sets and Moments;
- marker endpoint affinity, including right-default `@x!` and left `~@x!`;
- parse-first literal Slot binding that cannot inject Script syntax;
- malformed reserved `<`, `@`, `${` or escape syntax fails closed.
- conservative canonical Script formatting with semantic round-trip and
  idempotence guards.

### Source closure

- transitive, cycle-checked `.svc` imports;
- typed `.svs` classes with Component default → classes → instance precedence;
- whole-attribute references with no Prompt interpolation;
- root reachability, fan-out and unused declaration elimination;
- identity independent of line number, import order and local alias;
- execution digest separate from stable identity;
- content-addressed material staging and exact lock verification.

### Runtime and lowering

- `.svk` manifest ports, parameter schemas and implementation hashes;
- recursive child-content schemas, child cardinality and field/reference types;
- explicit Selection/Moment `one`, `each` or `set` consumption enforced by the
  isolated ABI rather than guessed from a Track name;
- capability-profile Plan instances resolved only through exact
  `svml.artifacts.v1` bindings; the compiler has no implicit provider fallback;
- one child process and restricted VM realm per projection;
- no network, wall clock, ambient random source, Node builtin import, `process`,
  `require`, dynamic import or global DOM;
- pure JSON input/output, execution timeout and memory limit;
- scoped CSS and rejection of active/unscoped markup;
- integer half-open frame ranges lowered safely to HyperFrames seconds;
- separate flat visual and audio fragments, global visual `z`, presentation priority,
  audio buses and explicit media time mapping;
- Item/Present intersection without restarting source time;
- B-roll visual crossfade independent of source audio;
- Film as the unique reachable root and current prototype master-clock owner. The
  architecture draft moves clock creation to a selected Basis Component and leaves
  Film as the sole `Track[]` consumer.

## Deliberate next boundaries

The following are not silently approximated:

1. Live Capability Host adapters for generation, STT and media probing.
   Capability calls already remain typed Plan nodes and can be satisfied by
   verified offline artifacts; no provider adapter or credential path exists yet.
2. A live capability request adapter. SVML v1 intentionally does not let a Component
   hide additional Plan calls; reusable multi-call topology belongs in `.svc`.
3. A lossless whole-document CST and formatter. The implemented Script formatter
   is deliberately conservative and refuses unsupported structural-line layouts.
4. Package/registry resolution beyond local relative imports.
5. Canvas UI layout and source edits projected back from Canvas. Canvas JSON
   intentionally contains no authored `x/y`; layout belongs to the viewer.
6. VLM, bbox and visual tracking. They are explicitly outside SVML v1's semantic
   spine and may later exist as evidence extensions or HTML post-processing.
7. Decoupled Basis Production and Location. Replace shared structural cuts with
   Script Surface v2 independent Segment endpoints; validate `2M + 2N`; prove both
   hard-cut and crossfade Basis Components through one `TemporalBasisProduction`
   ABI; then bind each through the same separately locked Locator ABI.
8. Flat Track ABI. Make every Track output absolute ProgramSpace visual/audio
   contributions, prohibit Track input ports, and keep Film as the only `Track[]`
   consumer. No public VisualSurface, VisualTree, AudioTree or Track Aggregator is
   introduced.

The next implementation milestone should be the typed request side of the
Capability Host contract. A live provider adapter must not be enabled until the
same request can be inspected and satisfied by a fake host without credentials.
