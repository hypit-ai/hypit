# `@hypit/audiovisual`

Low-level authored audiovisual relationships before Track, Film, Composition or renderer lowering.

All exact-time imports come from the clock-free `@hypit/temporal/algebra` entry. This package cannot observe
Timeline, Instant, Window, frame-projection or Studio APIs; those are owned by Timeline and Timeline Author.
All spatial relationships similarly come from `@hypit/spatial/algebra`; AVIR does not import Canvas, Frame,
author declarations or the legacy source-to-picture placement type.

The first implemented slice owns one resolved use of a typed Source:

- `ProgramSource` owns one or more nominally typed outputs. A `signal` output owns its factual local temporal
  domain; a `constant` output explicitly has no time dimension. Each Picture output also owns its local spatial domain;
- `Occurrence` gives that use stable author identity;
- `OccurrencePlacement` places an active range of the occurrence-local domain in one parent domain;
- one `TemporalMap` per selected signal maps occurrence-local positions to that output's local positions. A selected
  constant owns no fake Map and remains present for the finite Occurrence duration;
- a selected signal may carry one package-owned `SignalReconstruction`. It says how this particular mapped read
  becomes a signal, while the Mapping remains the only target-to-source coordinate fact.

Move changes only parent placement. Trim changes the active occurrence-local range while preserving the
parent positions of retained content. Remap changes only the target-to-source relation. Split creates two
explicit identities that retain the same Source and Mapping. None of these operations resolves frames or
requires a global Timeline.

This package accepts only resolved, positive finite domains wherever time exists. `constant` is a tagged absence
of a time dimension, not an unknown or nullable Domain. Future graph values remain ordinary typed
Operation results until their real Source closes; AVIR does not add nullable or symbolic domains.
`@hypit/audiovisual-author` owns the syntax-neutral finite author linker, while terminal Programme lowering
belongs to downstream adapters. This package deliberately has no activation, Markup, Studio, Runtime or
renderer entry point.

The Programme owns Occurrences once and its Picture and Audio DAGs refer to `occurrence + output port`.
This lets one media, component or nested Programme carry coordinated Picture and Audio through one edit
identity without an A/V-link special case.

The first Picture slice is a normalized data-only DAG on one Program domain. `use` reads an Occurrence,
temporal `restrict` limits time support, spatial `crop` limits local picture support, `remap` samples a child
Space from an explicit parent-to-source `SpatialMap`, ordered `over` establishes paint order, and `apply`
connects package-owned Operators through named Picture ports. A processed node can feed any later Operator, and a closed
Picture Program becomes an ordinary Source when nested. There is no Media, Compound, Track or Adjustment
branch in this algebra. Audio uses the parallel closed vocabulary `silence / use / restrict / mix / apply`;
its `mix` is signal summation while effect and sidechain roles use named Operator ports. The same graph already
represents dry/wet branching, shared returns and sidechain routing without AudioTrack or Mixer-lane semantics.

`SignalReconstruction` is a typed programme envelope attached to a signal selection, not to a Source, Media,
Clip or Temporal Map. Core validates its nominal signal Type and opaque programme shape but does not know
nearest-frame, optical-flow, resampling or preserve-pitch names. The author intermediate layer can bind the value
directly or receive it as an ordinary future Operation result. A terminal sees it together with the exact mapped
use and either executes that package-owned format or rejects it accurately. Reconstruction never contains or
infers speed; the selected Mapping remains authoritative.

Picture and Audio Operator values carry their package-owned id, ordered named ports, named temporal Control
domains, a general temporal-support contract and one opaque execution programme (`format / payload / artifacts`).
Support is declared per input as exact before/after distances, plus independent or sequential state, finite
pre-roll, execution latency and tail. These fields describe signal dependency rather than motion-blur, denoise,
reverb or another effect name. Every `apply` binds each declared
Control exactly once. AVIR validates ports, bindings and the envelope but never switches on a format or effect
name. A terminal either supports that programme format or rejects it at its capability boundary. Keeping the
programme on the typed Operator removes the old hidden resolver lookup and lets parameters such as transition
easing or audio gain travel with the exact operation that owns them.

A Programme that produces Picture declares one finite `pictureDomain`. Every Picture `use` begins in its
Source output's own Space. `remap` is the only ordinary node that changes Space; `over` and the current
pointwise typed Operators require their inputs to have the same Domain, and the graph root must close in the
Programme's `pictureDomain`. The same nested Programme may therefore be used by two Occurrences and remapped
into two parent regions without copying its internal layout or inheriting the final Canvas. Output frame-rate
selection preserves these Maps unchanged.

## Resolved Controls

`TemporalControl<Value, Interpolation>` is the first resolved `Control<D, T>` specialization. It is a
total sequence of exact, contiguous segments over one `LocalTemporalDomain`. The generic evaluator
computes exact rational segment progress but does not interpret values, easing names or interpolation
payloads. Its caller owns that policy.

One Control use has an explicit temporal binding:

- `program` reads the current Programme-local position;
- `occurrence` derives occurrence-local position from current Placement;
- `source` additionally follows one output's Temporal Map; and
- `mapping` uses an explicitly supplied Programme-to-Control Temporal Map.

Consequently occurrence-local motion follows Move and ignores Slip, source-local motion follows Slip,
and program-local motion remains at its absolute parent position. These are graph consequences rather
than Studio preferences.

`temporalControlBindingMap()` closes every binding as one exact Programme-to-Control `TemporalMap`.
Point evaluation and continuous terminal execution are two consumers of that same relation: the former
asks for one mapped position, while Audio lowering preserves the whole Map for sample-by-sample evaluation.
There is no separate keyframe clock, fade coordinate system or Audio-only binding rule in Core.

`SpatialMapControl` is the first value-specific Control. Its `affine-linear` policy belongs to the
Spatial Map value boundary and interpolates affine coefficients; `remap-control` resolves it at one
exact time into the ordinary static `remap` node. The first slice intentionally has no Keyframe author
syntax, easing catalogue, normalized-progress Domain, tracking document conversion or automatic
shortest-path rotation. Those require their real owner rather than branches in generic Control.

`projectNleOccurrences()` is the first read-only workbench projection. It emits one exact parent range
per Occurrence and keeps each selected output's Mapping. It emits no Track, lane, frame index or copied
source range.

An optional `NleView` stores only ordered lanes and `occurrence + output` membership. That distinction lets
one shared audiovisual Occurrence appear as separate Picture and Audio rectangles without duplicating its
identity or timing. `projectNleView()` joins membership with derived Occurrence facts; empty lanes are valid,
and deleting the whole View leaves Programme evaluation unchanged. A View never owns placement, Mapping,
paint order or audio routing.

Programme-level Move, Trim and Remap replace the one authoritative Occurrence and then validate the closed
Programme. Existing Views remain unchanged and derive their next rectangles from the edited Programme. There
is no second frontend timeline to synchronize.

`slipProgramOccurrence()` atomically replaces an explicit subset of output Maps while preserving placement.
Reverse, hold, loop and variable speed use the same primitive after their owner constructs the exact Map; AVIR
does not add gesture-specific nodes. `rollProgramOccurrences()` requires two named Occurrences that already
share one parent boundary, then trims their active local ranges to the new boundary in one Programme update.
It never derives adjacency from a View.

`rippleTrimProgramOccurrence()` trims one named boundary and shifts only an explicit transient list of
Occurrence identities by that boundary's delta. The scope is command input, not persisted Programme or View
state; Core never guesses “everything later on this Track.” Validation seals the whole result atomically.

Programme-level Split replaces the Occurrence and every affected Picture and Audio `use` atomically. The old
Picture node id becomes an ordered `over` of the two new uses; the old Audio node id becomes their `mix`, so
downstream effect references stay stable. New Occurrence and graph node identities are explicit inputs. An
optional View transform replaces old membership with the two identities; an unchanged View fails as a dangling
reference instead of silently displaying stale rectangles.

`evaluateAudiovisualProgramAt()` is the first execution-facing seam. Given one exact Programme-local position,
it preserves the Picture and Audio DAGs, including crop and remap nodes. Each active signal `use` resolves through
Placement and its output's Temporal Map to a source-local position; each active constant `use` remains a timeless
Source selection. Inactive uses and signal Mapping gaps become `transparent` or `silence`.
The evaluated Picture graph carries its root local spatial Domain, so a terminal consumer never needs to
recover a Canvas or inspect author structure to interpret its coordinates.
It selects no frame rate, sample rate, Canvas, DOM or renderer: an Output policy chooses the exact positions to
evaluate later. The legacy HTML Programme is therefore not the new author ABI.

`VideoFrameSampling` is the first such terminal policy. It contains only an exact rational frame rate, derives
the frame count needed to cover the Programme duration, and maps each frame index to an exact Programme-local
position before calling the same evaluator. It has no Timeline identity and never rewrites Programme Domains,
Mappings or Occurrences. Rendering the same Programme at another frame rate is therefore a new output choice,
not an author-model migration.

`@hypit/audiovisual-html` is the first downstream terminal adapter. It accepts a complete Output frame sequence,
consumes an explicit fold of typed terminal Source implementations,
lowers crop, static remap and ordered over, and places each package-owned Operator programme behind its named
slots before compiling a valid
one-frame or multi-frame `HtmlProgram`. The adapter inverts AVIR's
parent-to-source Spatial Map once at the CSS boundary. This package does not import that adapter or any HTML,
Timeline, Composition or Canvas type. Each graph path becomes one stable multi-frame terminal instance. The
Output owns an explicit viewport-to-Programme Picture Map, so output raster extent no longer has to equal the
Programme Space. Package-owned Picture reconstruction survives on media selections; the first HTML format
executes nearest-frame selection while other formats remain Provider capability decisions.

`@hypit/audiovisual-audio` is the parallel downstream Audio adapter. It consumes the complete resolved Audio
DAG rather than frame evaluations, preserves the Programme Domain and lowers silence, use, restrict, mix and
arbitrary named apply ports into the continuous `AudioProgram`. Typed terminal Source values carry signals in
the Source output's own Domain through an explicit AuthorGraph fold; the generic adapter owns parent placement.
Operator programmes and their temporal-support contracts pass through directly. Every Audio Process also receives the complete
Programme-to-Control Maps declared by its corresponding `apply`; a terminal can therefore evaluate
package-owned automation continuously without turning it into Clip fields or video-frame samples.
This package does not import that adapter, PreparedMedia, AudioProgram or a Renderer.

`@hypit/audiovisual-media` is the one-way upstream adapter for real media. It publishes the selected visual
and audio members of one `PreparedMedia` as coordinated `ProgramSource` outputs with their actual temporal
and spatial domains. It does not prepare media or apply occurrence edits. A Programme must explicitly remap
a media Picture domain into its own Picture domain; matching pixel dimensions do not make two named spaces
identical.

The same adapter owns the direct still-picture branch. An explicit identity, image Artifact, complete
`PictureInterpretation` and local spatial Domain close one `StillPictureSource`; its AVIR projection is a
`constant` Picture and therefore has no temporal Domain. The finite use duration belongs only to an Occurrence.
Artifact and interpretation facts do not enter this package.

The inverse nesting edge is now an ordinary `program-source` Producer owned by this package. It projects a
closed `AudiovisualProgram` to the same `ProgramSource` facts as `audiovisualProgramSource()`; the graph edge
retains the child Programme dependency while the parent sees only its typed outputs and Domains. This adds no
Compound category and no Author Fragment machinery to the algebra package.
