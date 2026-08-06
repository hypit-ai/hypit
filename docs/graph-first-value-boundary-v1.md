# Graph-first value boundary v1

Status: current architecture law implemented by the v2 contracts and BuildState.

## The sentence to remember

SVML is a pleasant author Surface for declaring a graph. It is not a serialized left-to-right
pipeline, and its intermediate values must not grow a hidden pipeline by copying every upstream
identity forward.

The same authored source may lower to fan-out, fan-in, shared subgraphs, several independent
Targets and explicitly selected alternative Candidates. The verified `CompiledGraph` is the only
source of dependency truth.

```text
                                 ┌─> VisualTrack ────────────────┐
Narrative ─> estimate ─> Take ───┤                              │
     │                           └─> SpeechAudioBasis ─┐         │
     │                                                ├─> Map ──┼─> CaptionTrack
     │       SpeechAudioBasis ─> evidence WAV ─> STT ─┘         │
     └──────────────────────────────────────────────────────────┘

Another Target may stop at Take, VisualTrack, raw STT evidence or Map. No Film or final render is
the privileged graph root.
```

## Four different homes

| Fact | Canonical home |
|---|---|
| What the author connected and which Candidate was selected | `CompiledGraph` + `BuildRequest` |
| What one value intrinsically is | typed `Record.value` |
| Which exact inputs and implementation produced a Record | `Derivation` |
| Which external request was fulfilled, by whom and with what result | `Need` + `Receipt` |

`Derivation` binds the Producer, implementation digest, every direct input Record id and digest,
every output Record id and digest, every Need request digest and the accepted Event digest. A domain
value does not become more verifiable by copying those facts into itself; it only acquires a second,
easily inconsistent account of the graph.

## Admission rule for a value field

A field belongs in a shared value contract only when at least one of these is true:

1. a consumer needs it to interpret that value without reconstructing its producer;
2. it identifies the coordinate space or exact physical subject the value describes;
3. it is the value's own content identity and the value may be embedded outside a Core Record.

If the only justification is “this proves the producer received input X”, the field belongs in the
Graph/Derivation instead.

Therefore these are intrinsic and remain:

- Blob digests, dimensions, codecs and exact durations;
- ProgramSpace identity on time-based values and Tracks;
- the exact acoustic Artifact measured by STT evidence;
- `MediaInspection.source`, because an inspection is a claim about those exact bytes;
- deterministic source-to-normalized time/sample maps when consumers may project coordinates;
- a Product's own digest when it is projected or transported as an embedded value.

These are transitive lineage and are forbidden from generic result values:

- Narrative or request identity copied through generated media, SpeechBasis, evidence and Maps;
- model choice and requested duration repeated in generated-media results;
- generic `Track.sources[]` provenance lists;
- input inspection/selection digests repeated in normalized media;
- Map, Caption or B-roll fields whose only meaning is “came from this upstream Record”.

Provider diagnostics and raw external responses belong in Receipt metadata or content-addressed
Artifacts, not in a provider-neutral result contract.

## Affinity is not provenance

Core's generic affinity comparison remains necessary, but only for an intrinsic equality that must
hold between two directly connected values. Examples include:

- a projected Blob must actually be a member of its generated Product;
- a Track and Composition must occupy the same ProgramSpace;
- WhisperX evidence must describe the exact evidence-audio Blob submitted to the Endpoint;
- a normalized result must use the selected stream and shared presentation origin it claims.

Adding a field to an output solely so an affinity can compare it with an input recreates hidden
lineage and is not allowed.

## Candidates, provided values and partial builds

A provided value, historical reuse or preview is simply another explicitly selected Candidate. If
its root is a constant value, reverse Demand stops there because the realized graph has no upstream
edge. It does not need a fake “pin source” field in the value.

Multiple Targets are peers. Reverse Demand walks all selected roots, memoizes shared Operations and
executes one shared upstream Operation once. A source file may expose several graph terminals for
inspection or delivery; none must be wrapped in Film merely to become executable.

## Package consequence

Author packages own beautiful SVML Surfaces and lower them to typed Records and graph fragments.
Contract packages own intrinsic shared vocabulary. Producer packages own deterministic transforms.
Provider packages fulfill exact external Needs. None may replace graph edges with a convention that
passes an ever-growing context object down a presumed pipeline.
