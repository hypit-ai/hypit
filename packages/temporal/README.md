# `@hypit/temporal`

Clock-free exact-time algebra and explicit sampling conversion.

New low-level code imports `@hypit/temporal/algebra`. That entry owns only:

- `ExactTemporalValue` and exact rational arithmetic;
- `LocalTemporalDomain` and `TemporalRange`;
- edge-relative `ExactTemporalRelationSpec` author intent and its finite-domain resolver;
- `TemporalMap`, its pieces, composition and sided evaluation; and
- total `TemporalControl<Value, Interpolation>` segments over one local Domain;
- exact variable-rate profile integration.

The `algebra` source and type graph does not import frame projection, NLE views, Studio or author
declarations. `@hypit/audiovisual`, the resolved parts of `@hypit/media`, and continuous Audio Programme paths
use this entry.

The package root contains syntax-neutral duration/relation literals, Extent construction and sampling facts.
It has no activation, Module manifest, Producer, Refinement or graph-protocol dependency. Placement belongs to
audiovisual occurrences and is supplied as finite domains and mappings. Discrete conversion has its own
`@hypit/temporal/sampling` entry and is also exported from the package root for terminal consumers. Sampling is
not reachable from `algebra`.

`@hypit/temporal-graph` is the optional typed-graph adapter. It owns nominal graph Type identities, Value schemas
and refinements, but no arithmetic or generic temporal operation. Direct NLE, Caption and Script code never need
that adapter.

`sampling` accepts only a structural `{ frameRate }` grid, validates it locally and has no project identity or
extent. It owns `FrameSpan`, exact/grid conversion, explicit boundary policies and frame-to-audio-sample boundary
quantization. HTML terminals, local rendering and media delivery therefore share one rule without importing an
author project.

The temporal entries contain these exact coordinate values:

- `ExactTemporalValue`: integer ticks on an exact rational time base;
- `LocalTemporalDomain`: one named finite local interval with no output sampling grid;
- `TemporalExtent`: an unpositioned exact duration; and
- `TemporalMap`: a composable piecewise target-to-source relation between named local domains.

These values contain the minimal facts needed by consumers. Their derivation remains in the typed graph and the
producing package. Temporal does not carry a closed source-kind union; domain packages retain the meaning of the
exact positions they project.

`TemporalExtent` lets an imported or generated value publish an exact known duration without exposing
the operation that discovered it. It does not carry a frame rate. A terminal consumer combines exact
time with an explicit sampling grid and one `exact`, `cover`, `inside` or `nearest` boundary rule.
`cover` is the normal whole-media policy because it retains the final partial output frame.

`TemporalMap` is a partial relation: omitted target ranges are gaps. An affine piece uses an exact
rational rate; rate zero is hold, a negative rate is reverse and `wrap` expresses loop. A cubic piece
uses four exact source positions over a linearly parameterized target range. Its controls must be
monotone, so one piece has one direction; holds and direction changes use adjacent pieces.
Composition preserves a sequence of independently meaningful
stages rather than flattening them through a registry. The relation answers where target time reads
source time; visual interpolation and audio resampling remain signal-domain responsibilities.
`assertTemporalMapPieces` can validate target-local structure, non-negative source coordinates, rate/wrap
shape and cubic monotonicity before a concrete Source domain is available; attaching the Source domain in a
complete Map adds its upper-bound checks. `sliceTemporalMapPieces` exactly subdivides and rebases affine or cubic
pieces, `extrapolateTemporalMapPieceRange` performs exact polynomial continuation for an edited boundary, and
`coalesceTemporalMapPieces` removes only provably equivalent adjacent affine cuts. These are relation algebra,
not NLE commands or frame-sampling policy.
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

`preimageTemporalMap` performs the opposite query without creating an opposite Map. Given an inclusive
source region in sided temporal order, it returns every exact target region whose forward image is in
that set. The bounded result naturally represents no match, one or many loop matches, and hold ranges;
composed stages are traversed in reverse. Affine pieces are exact. A query intersecting a non-constant
cubic piece fails explicitly because a cubic root is not generally rational and this algebra does not
silently introduce an epsilon or sampling grid.

`TemporalMapRegionSet` pairs those regions with the local domain that owns their
coordinates. `preimageTemporalMapRegions` verifies that identity against the Map source before returning a
set in the Map target domain. `uniqueTemporalMapRegionSetPoint` is an intentionally strict consumer policy:
it accepts exactly one zero-width sided region and rejects absence, loops, holds and other ambiguity.

`ExactTemporalRelationSpec` is the clock-free construction form used by an occurrence owner before its
Map can close. Its points are exact inward offsets from the start or end of the finite target and source
domains; its rate, fit and cubic relations can form one piecewise specification. The resolver accepts no
frame grid and runs only after both domains exist. Thus trim, slip, reverse, hold, loop and curve are
different ways of constructing one target-to-source relation, not Temporal object kinds and not Media
transforms. `TemporalRelationSpec` accepts author-facing duration literals, converts frame-bearing
values only at an explicit sampling boundary, and delegates to this same exact resolver.

Exact duration, rate, relative-point, affine-relation and cubic-relation parsing is part of this package's
syntax-neutral value contract and is exported from the main entry. Author packages can therefore
construct exact Maps without importing Markup. Syntax-neutral audiovisual author specs own occurrence
placement and resolve it only after both finite domains exist. Visual, audio, caption, typography and
project components either keep timing local or publish an explicit occurrence relationship.

Temporal rejects positions outside their local domain and invalid map pieces. It does not clip,
repair, infer semantic meaning or perform rendering.

`TemporalControl` likewise owns only exact segment coverage and evaluation progress. The Value owner
validates states and interprets interpolation, so Picture filters, audio gain and Scene motion share
one time algebra without Temporal learning any visual, audio or spatial parameter catalogue.
