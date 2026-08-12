# SVML Video Track Authoring Model

The focused `@narratage/temporal` package implements strict occurrence expansion, exact rational
window projection and triggered sibling schedules. Shared Spatial, Text, Ranking, Media, Audio and
Screen Overlay are specified in [`spatial-layout.md`](./spatial-layout.md),
[`typography-track.md`](./typography-track.md), [`ranking-track.md`](./ranking-track.md),
[`media-track.md`](./media-track.md), [`deck-track.md`](./deck-track.md),
[`audio-track.md`](./audio-track.md) and
[`screen-overlay.md`](./screen-overlay.md). `@narratage/comment-sticker` uses the same Temporal and
Spatial foundations and lowers to one peer VisualTrack.

## Purpose

Official video packages need one shared discipline without one universal Track Program. Text,
Media, Ranking and Comment Sticker own different author meanings, but they must not independently
invent incompatible ways to answer the same temporal questions.

This document governs package Programs and their deterministic lowering. It does not add video
meaning to Core, Runtime, Composition or a Provider. The public terminal waist remains
[`VisualTrack` and `AudioTrack`](./track-composition.md).

The complete package-authoring separation is:

```text
content
temporal source
occurrence expansion
window projection
optional sibling sequencing
intrinsic-material occupancy
spatial source and layout
presentation
```

These are independent authoring concerns, not mandatory fields in every package and not fields on
the public Track contract.

## 1. Temporal pipeline

```text
Narrative Selection ──> { start, end } occurrences ─┐
Narrative Moment ─────> { cue } occurrences ────────┼─> occurrence expansion
Program singleton ────> { program.start/end } ──────┘
                                                        │
                                                        ▼
                                              Temporal Window Projection
                                                        │
                                                        ▼
                                           raw directed candidate windows
                                                        │
                                                        ▼
                                      ProgramSpace intersection + validation
                                                        │
                                                        ▼
                                              frame-exact projected windows
                                                        │
                                                        ▼
                                      optional package-owned sibling sequencing
                                                        │
                                                        ▼
                                                final allowed windows
                                                        │
                                                        ▼
                                      intrinsic-material occupancy / playback
                                                        │
                                                        ▼
                                        render intervals + source-time sampling
```

The layers answer different questions:

| Layer | Question |
|---|---|
| anchor location | At which physical frame is an authored anchor? |
| occurrence expansion | Does one authored item consume exactly one occurrence or every occurrence? |
| window projection | Which ProgramSpace interval may this occurrence occupy? |
| sibling sequencing | How do related items hand off, overlap or close one another? |
| occupancy | How does a product with intrinsic duration sample itself inside its final window? |

No `full`, `fixed`, `relative`, `from`, `until`, `fill` or `fit` union may collapse these layers
again. An author Surface may offer readable shorthand, but it must lower to the separated model.

## 2. Temporal sources provide points, not renderable windows

A Selection occurrence contributes an ordered pair of located points:

```ts
type LocatedSelectionOccurrence = {
  readonly id: string;
  readonly start: FramePoint;
  readonly end: FramePoint;
};
```

A Moment occurrence contributes one located point:

```ts
type LocatedMomentOccurrence = {
  readonly id: string;
  readonly cue: FramePoint;
};
```

A Program source is a singleton occurrence. Every projection environment also has the two exact
ProgramSpace boundaries `program.start` and `program.end`.

Selection location must preserve Script occurrence order and the two authored anchor identities. It
must not sort, merge, clip, exchange or take the absolute difference of the points. A located
Selection whose `end` precedes its `start` remains valid point evidence. Only a consumer creates a
window and therefore only the projection layer can decide whether the points it actually consumes
form a valid interval.

A component-owned exact time product, such as an already timed Caption Cue, may enter the later
frame-window stages directly. It does not need to pretend that its own timing came from a Narrative
Selection.

## 3. Point expressions and Temporal Window Projection

The shared projection algebra is conceptually:

```ts
type TemporalPointExpression =
  | { readonly ref: "program.start"; readonly offset?: Duration }
  | { readonly ref: "program.end"; readonly offset?: Duration }
  | { readonly ref: "selection.start"; readonly offset?: Duration }
  | { readonly ref: "selection.end"; readonly offset?: Duration }
  | { readonly ref: "moment.cue"; readonly offset?: Duration }
  | { readonly ref: "absolute"; readonly at: Duration };

type TemporalWindowProjection = {
  readonly start: TemporalPointExpression;
  readonly end: TemporalPointExpression;
};
```

The serialized contract uses explicit units for durations. Seconds, milliseconds and integral
frames are distinct author inputs; conversion to a rational ProgramSpace has one deterministic
boundary-quantization rule. The vocabulary contains no privileged Base Track boundaries.

Common author meanings are ordinary expressions:

| Meaning | Projection |
|---|---|
| complete Program | `[program.start, program.end]` |
| identity Selection | `[selection.start, selection.end]` |
| three seconds from Selection start | `[selection.start, selection.start + 3s]` |
| three seconds after Selection | `[selection.end, selection.end + 3s]` |
| persist from Selection start | `[selection.start, program.end]` |
| lead two seconds into Selection start | `[selection.start - 2s, selection.start]` |
| three seconds after a Moment | `[moment.cue, moment.cue + 3s]` |
| first three seconds | `[program.start, program.start + 3s]` |
| absolute advanced window | `[absolute(2.5s), absolute(6s)]` |

`full`, `manual`, `fixed` and `relative` may remain presentation words in an authoring UI, but they
are not distinct compiled timing laws.

### Semantic binding may deliberately ignore local coordinates

An author may bind an item to a Selection over the opening words while projecting it to
`[program.start, program.start + 3s]`. The Selection still contributes author meaning, occurrence
identity, cardinality and dependency truth even though its located start/end coordinates are not
used by that projection.

This is valid with `one`. It is deliberately restricted with `each`, as defined below, because
repeating an occurrence-invariant projection would otherwise manufacture identical windows.

## 4. Occurrence expansion is strict and precedes projection

The contract has two non-overlapping choices:

```ts
type OccurrenceExpansion =
  | { readonly kind: "one" }
  | { readonly kind: "each" };
```

`each` means compile-time expansion, not media looping. Author Surfaces expose it through their
own explicit occurrence setting and lower to this exact value.

### `one`

`one` has the following exact law:

1. locate the complete source occurrence set;
2. require its cardinality to equal one before evaluating the projection;
3. reject zero or more than one occurrence;
4. never choose `first`, `last`, `best`, nearest or earliest;
5. project that one occurrence exactly once.

A projection that ignores Selection/Moment coordinates is normally paired with `one`. Program-only
timing uses the intrinsic singleton Program source and therefore also lowers as `one` without an
author-visible cardinality setting.

### `each`

`each` has the following exact law:

1. require one or more located source occurrences;
2. preserve source occurrence identity and source order;
3. instantiate exactly one projected occurrence for every source occurrence;
4. evaluate the same projection independently in each occurrence's local point environment;
5. derive stable result identity from the authored item id and occurrence id, never an incidental
   sorted index;
6. never merge, deduplicate, sort by time, pick a winner or silently discard an occurrence;
7. fail the whole deterministic Operation when any occurrence cannot produce a valid window.

For more than one source occurrence, at least one projection boundary must reference a local point
(`selection.start`, `selection.end` or `moment.cue`). A projection using only Program or absolute
points is occurrence-invariant and is rejected under `each`: it would create several semantically
different instances with the same physical window and no temporal distinction. The author should
use `one`, bind the Program singleton, or author separate explicit items.

Projection is one-to-one. One occurrence cannot fan out into several windows. An author who wants
two windows from one Selection or Moment writes two items or uses a package-owned component that
explicitly constructs those two items.

Set aggregation is not a third generic expansion mode. A visibility mask or another genuinely
set-valued component may define a package-owned set consumer, but ordinary visual items must not use
that exception to regain hidden merge, union or deduplication behavior.

Caption `Mute` is one concrete package-owned example. It unions explicitly referenced
`CaptionDisplayWordSubset` values inside `CaptionProgram`; it does not alter generic occurrence
expansion, manufacture projected windows, or enter Core.

### Cardinality does not decide overlap

`each` says only how an occurrence set expands. It does not say whether the resulting windows may
overlap, whether adjacent windows should join, or whether one item closes at the next item's cue.
Those questions cannot be answered before projection and may also depend on package semantics.

After projection, a consuming package must choose and validate one explicit relation appropriate to
its component, for example:

- `independent`: overlapping windows are meaningful and remain independent;
- `disjoint`: any overlap between occurrences of the same authored item is an error;
- a package-owned Sequence or Deck policy that derives final sibling windows and handoffs.

This relation is not part of `OccurrenceExpansion` and is not owned by Core. Official simple Text,
Comment Sticker and similar repeated items should normally require disjoint projected windows.
Media groups and Ranking components may own stronger, explicit sibling rules. No package receives a
hidden global auto-stitch behavior.

### Triggered stages are sibling sequencing, not another temporal source

Ranking, Tier, slides and other progressive components often have only an ordered set of trigger
Moments. Reaching trigger `i` enters state `i`; reaching trigger `i + 1` hands off to the next state.
This case uses the same point location and window projection. It does not justify a `Stage` Type in
Core or another Script marker.

`N` trigger points alone cannot bound `N` finite stages: the last stage still needs one terminal
boundary. A triggered component therefore owns an explicit outer window `[B, O)` and an explicit
stage-terminal point `T`. `T` may reference `O`, but the package must not silently assume that it
does. Keeping them separate lets a Ranking component finish its last item at `T` and leave the
fully-settled board visible until `O`. Given located and frame-quantized trigger points
`p1 ... pN`, the package may derive:

```text
stage 1  [p1, p2)
stage 2      [p2, p3)
...
stage N              [pN, T)
settled suffix                [T, O)   (when T < O)
```

The interval before `p1` is inactive, not an implicit stage zero. If a design needs an initial
visible state from the enclosing start to `p1`, that state must be explicit and produces `N + 1`
stages. A renderer must never infer it from the presence of a board or background.

This pattern has two related but distinct package-owned lowerings:

```text
outer component       [B, O)
cumulative item 1     [p1, O)
cumulative item 2     [p2, O)
cumulative item 3     [p3, O)

exclusive stage 1     [p1, p2)
exclusive stage 2     [p2, p3)
exclusive stage 3     [p3, T)
settled suffix        [T, O)       when T < O
```

The cumulative form is ordinary `each` projection of `[moment.cue, outer.end]` with an explicit
overlap policy. It naturally implements a Tier board: after `p2`, both item 1 and item 2 are active;
the visible prefix itself is the current logical state. No materialized board snapshot is required.

The exclusive form starts from the same candidates and applies a successor-handoff policy: each
candidate's final end becomes the next candidate's start, while the last ends at `T`. This can drive
a Ranking staging area that shows exactly one current item while already-settled items remain as a
separate cumulative prefix. When `T < O`, the suffix has no current item and shows the completed
state. The package may lower both views into independent Presents in one peer `VisualTrack`.

Triggered sequencing has the following exact law:

1. preserve authored/source occurrence order and stable occurrence identity;
2. never sort triggers by physical time;
3. require at least one trigger, one explicit outer window and one explicit stage-terminal point;
4. after frame quantization, require `B <= p1 < p2 < ... < pN < T <= O`;
5. reject reversed triggers, equal-frame collisions, triggers outside the outer window and a last
   trigger at or beyond `T` atomically;
6. zip an ordered item list to trigger occurrences only when the component contract explicitly says
   so and requires equal cardinality;
7. derive item/stage identities from authored item and occurrence identities, never array indexes;
8. keep cumulative overlap or successor handoff as declared package semantics, never Runtime choice.

A package may instead give every child item its own single-occurrence Moment edge. Both author
surfaces lower to the same ordered sibling candidates; positional zipping is not an implicit global
behavior. Triggered stages are internal deterministic lowering facts unless another component has a
real need to consume them. Composition still receives only ordinary Presents.

## 5. Projection validation and negative intervals

For each expanded occurrence, projection executes in this order:

1. evaluate raw start and raw end in the exact rational ProgramSpace;
2. reject missing, non-finite or type-invalid point expressions;
3. if raw end precedes raw start, reject a reversed window before clipping;
4. if raw end equals raw start, reject a zero-length render window;
5. intersect the forward raw window with `[program.start, program.end)`;
6. deterministically quantize it to a half-open integer frame span;
7. reject an empty result or a result shorter than one frame;
8. return only `{ startFrame, endFrameExclusive }` values wholly inside ProgramSpace.

Clipping to ProgramSpace is the mathematical intersection with the only observable render domain,
not guessed timing. A negative intermediate point is therefore allowed:

```text
cue = 1s
[cue - 3s, cue + 2s] = [-2s, 3s]
intersection             [0s, 3s]
```

A raw reversed interval must never be hidden by clipping, sorting or absolute value. An interval
entirely outside ProgramSpace becomes empty and fails; it is not silently omitted. Renderers receive
only already validated frame spans and perform no temporal repair.

A crossed Selection anchor pair is not by itself a projection failure. Identity projection
`[selection.start, selection.end]` fails when it produces a reversed window, while
`[selection.start, program.end]` may remain valid because it does not consume the crossed end point.

## 6. Intrinsic duration and occupancy

Every presented product either has a verified intrinsic duration or it does not. Unknown duration
must not masquerade as either case; media inspection must establish it before an intrinsic-duration
occupancy policy can execute.

Durationless products such as Text, static images, Comment Stickers and ordinary Ranking UI occupy
their complete final projected window. Local enter, exit and loop animation is presentation inside
that window, not synthetic material duration.

An intrinsic-duration product receives a final allowed window and an explicit playback policy. The
conceptual visual policies are:

```ts
type IntrinsicPlayback =
  | { readonly mode: "once"; readonly align: "start" | "end" }
  | { readonly mode: "hold"; readonly align: "start" | "end" }
  | { readonly mode: "loop"; readonly align: "start" | "end" }
  | { readonly mode: "stretch" };
```

End alignment never means reverse playback. It
means the forward-playing source ends at the projected window's end. If the source is longer than
the window, start alignment selects the source head and end alignment selects the source tail.

| Policy | Source shorter than window | Source longer than window |
|---|---|---|
| `once/start` | play from window start, then disappear | play source head until window end |
| `once/end` | appear late and end at window end | play source tail and end at window end |
| `hold/start` | play, then hold last frame | play source head until window end |
| `hold/end` | hold first frame, then play to window end | play source tail to window end |
| `loop/start` | repeat from source head phase | clip after as many loops as fit |
| `loop/end` | choose loop phase so source tail meets window end | same tail-phase law |
| `stretch` | slow all source time into the window | accelerate all source time into the window |

Audio must define its own truthful vocabulary over the same schedule. It cannot hold one PCM sample
as if it were a video frame. Outside one-shot audio is silence, padding is explicit, looping is
looping and stretching must enforce authored speed bounds. Static images and durationless UI do not
accept meaningless intrinsic playback modes.

Source trim and source in/out points, when added, operate before occupancy to define the effective
intrinsic source interval. Spatial contain/cover and Text flow/shrink operate after temporal
occupancy and are unrelated.

## 7. Package ownership

There is no umbrella `contracts` package. Nominal shared meanings are owned
by focused modules such as Narrative, ProgramSpace, Media and Composition; Core has no registry of
video-domain unions.

The temporal algebra in this document is implemented by the focused video-domain package
`@narratage/temporal`. It owns the projection types, validators and pure
frame-window projection. It may consume Narrative point references, SemanticMap location and
ProgramSpace, but it must not know Text, Media Track, Ranking, Comment Sticker, Film, HyperFrames,
Runtime or a Provider.

Official packages then use the same implementation:

```text
Text ───────────────┐
Media Track ────────┤
Deck Track ─────────┤
Ranking ────────────┼─> @narratage/temporal ─> frame windows
Comment Sticker ────┤
Screen Overlay ─────┤
Audio Track ─────────┘
```

Caption's component-owned timed Cue projection may enter the final frame-window stage directly.
Speech Spine establishes ProgramSpace and contiguous speech takes. Other Tracks may address one
whole Narrative Segment through its two structural anchors directly, without pretending it is an
authored Selection.

## 8. Package consequences

The current `typography-track` Surface consumes the shared temporal package for Program, Selection
and Moment bindings, explicit point expressions and `one`/`each` expansion. It does not maintain a
second timing enum. Media Track consumes the same package for Item and Sequence timing.

## 9. Ranking specialization

The Ranking component split and group schedule are specified in [`ranking-track.md`](./ranking-track.md).
Ranking validates that the common temporal algebra can
support cumulative state, exclusive current stages and a final settled suffix without adding
Ranking or `Stage` meaning to Core or the public Track contract.
