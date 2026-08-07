# Graph-first value boundary

Status: current architecture law implemented by the shipped contracts and BuildState.

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
2. it is actual authored or measured content of that value;
3. it is a content-addressed byte reference that a consumer must be able to retrieve.

If the only justification is “this proves the producer received input X”, the field belongs in the
Graph/Derivation instead.

Therefore these are intrinsic and remain:

- Blob digests, dimensions, codecs and exact durations;
- ProgramSpace inside an atomic SpeechBasis, because the Basis itself defines that synchronized
  coordinate system;
- frame/sample maps that are the actual output of a projection;
- deterministic source-to-normalized time/sample maps when consumers may project coordinates;
- the concrete Tracks or Takes accumulated by a fold value.

These are transitive lineage and are forbidden from generic result values:

- Narrative or request identity copied through generated media, SpeechBasis, evidence and Maps;
- model choice and requested duration repeated in generated-media results;
- generic `Track.sources[]` provenance lists;
- input inspection/selection digests repeated in normalized media;
- Map, Caption or B-roll fields whose only meaning is “came from this upstream Record”;
- a domain Product's own digest—the enclosing Core Record already has one;
- policy or coordinate context copied into a fold/set merely so later append Operations can find it.

Provider diagnostics and raw external responses belong in Receipt metadata or content-addressed
Artifacts, not in a provider-neutral result contract.

## Edges and Derivations are the relationship mechanism

Core deliberately has no generic JSON-Pointer “affinity” mechanism. A Producer receives every value
whose relationship it must validate as an explicit typed input. For example:

- Track creation and Film compilation receive ProgramSpace explicitly;
- media normalization receives source, inspection, selection and frame-rate inputs explicitly;
- WhisperX fulfillment is bound to the exact audio request by Need and Receipt;
- a Projection receives the atomic Product it projects.

The Producer validates intrinsic compatibility while it runs. Core records the exact input/output
Record digests in the Derivation. Adding comparison-only fields to the output would recreate a
second, incomplete graph and is not allowed.

An immutable fold value may retain the actual members accumulated so far. It must not retain policy,
ProgramSpace, source identity or the previous fold digest. Every append and finalization Operation
receives that context through ordinary graph edges.

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
