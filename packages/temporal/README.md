# `@hypit/temporal`

Clock-free exact-time algebra and explicit sampling conversion.

New low-level code imports `@hypit/temporal/algebra`. That entry owns only:

- `ExactTemporalValue` and exact rational arithmetic;
- `LocalTemporalDomain` and `TemporalRange`;
- edge-relative `ExactTemporalRelationSpec` author intent and its finite-domain resolver;
- `TemporalMap`, its pieces, composition and sided evaluation; and
- exact variable-rate profile integration.

The `algebra` source and type graph does not import `@hypit/timeline`, frame projection, Window, Studio or author
declarations. `@hypit/audiovisual`, the resolved parts of `@hypit/media`, and clock-free Audio Programme paths
already use this entry.

The package root contains syntax-neutral duration/relation literals, Extent construction, sampling facts and the
module manifest. It has no Timeline package dependency. Resolved author Timeline values remain outside this package;
the exact algebra does not import them. Discrete conversion has its own `@hypit/temporal/sampling` entry and is also
exported from the package root for terminal consumers. Sampling is not reachable from `algebra`.

`sampling` accepts only a structural `{ frameRate }` grid, validates it locally and has no Timeline identity or
extent. It owns `FrameSpan`, exact/grid conversion, explicit boundary policies and frame-to-audio-sample boundary
quantization. HTML terminals, local rendering and media delivery therefore share one rule without importing an
author Timeline.

The temporal entries contain these exact coordinate values:

- `ExactTemporalValue`: integer ticks on an exact rational time base;
- `LocalTemporalDomain`: one named finite local interval with no output sampling grid;
- `TemporalExtent`: an unpositioned exact duration; and
- `TemporalMap`: a composable piecewise target-to-source relation between named local domains.

These values contain the minimal facts needed by consumers. Their derivation remains in the typed graph and the
producing package. Temporal does not carry a closed source-kind union; domain packages retain the meaning of the
exact positions they project.

`TemporalExtent` lets an imported or generated result determine Timeline construction without making
Timeline understand media, speech, or the operation that discovered the length. It does not carry a
frame rate. The consumer resolves it on a selected Clock with one explicit `exact`, `cover`, `inside`
or `nearest` boundary rule. `cover` is the normal whole-media rule because it retains the final
partial output frame.

`TemporalMap` is a partial relation: omitted target ranges are gaps. An affine piece uses an exact
rational rate; rate zero is hold, a negative rate is reverse and `wrap` expresses loop. A cubic piece
uses four exact source positions over a linearly parameterized target range. Its controls must be
monotone, so one piece has one direction; holds and direction changes use adjacent pieces.
Composition preserves a sequence of independently meaningful
stages rather than flattening them through a registry. The relation answers where target time reads
source time; visual interpolation and audio resampling remain signal-domain responsibilities.
Every evaluation names the side of its exact target position: `after` reads content beginning at a
frame or sample boundary, while `before` reads the side ending at an exclusive boundary. Each Map
stage carries that side to its source, reversing it for negative motion and restarting at `after` for
a hold. Gaps and terminal boundaries therefore have no separate evaluator or inclusive-end exception.
At a cyclic boundary, `before` uses the `wrap.end` representative and `after` uses `wrap.start`,
independently of the piece's rate sign. Terminal signal consumers receive that source side when choosing
a discrete frame or sample; the Map remains exact and does not encode a renderer's interpolation policy.
An executor that evaluates the same immutable Map for many frames or samples binds
`createTemporalMapEvaluator` once at its Programme boundary. It uses this same sided evaluator while
keeping structural validation out of the hot loop; it is not a second sampling rule or a relaxed Map.

`ExactTemporalRelationSpec` is the clock-free construction form used by an occurrence owner before its
Map can close. Its points are exact inward offsets from the start or end of the finite target and source
domains; its rate, fit and cubic relations can form one piecewise specification. The resolver accepts no
frame grid and runs only after both domains exist. Thus trim, slip, reverse, hold, loop and curve are
different ways of constructing one target-to-source relation, not Temporal object kinds and not Media
transforms. The older `TemporalRelationSpec` accepts frame-bearing duration literals for Timeline-based
authors, converts them at its explicit sampling boundary, and delegates to this same exact resolver.

Exact duration, rate, relative-point, affine-relation and cubic-relation parsing is part of this package's
syntax-neutral value contract and is exported from the main entry. Author packages can therefore
construct exact Maps without importing Markup. Absolute Instant and Window author construction and shared declaration
reference helpers belong to `@hypit/timeline-author`, because it selects one completed Timeline and lowers author
relationships into a graph.
Consumers declare references to completed Timeline, Instant and Window values in their own
syntax-neutral Author Declaration shapes.
Domain packages such as `@hypit/narrative-temporal` project their own values into these
common types. Visual, audio, caption, typography and project components receive only the completed
Instant or Window plus the Timeline they already consume.

Timeline rejects Instants outside its finite domain and Windows whose endpoint Timelines or stored span disagree,
or which are reversed or empty. Temporal rejects positions outside their local domain and invalid map pieces. Neither
layer clips, repairs, infers meaning or performs rendering.

Author-directed absolute-time editing belongs to
[`@hypit/timeline-author`](../timeline-author/EDITING.md), not to this algebra package.
