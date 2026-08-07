# SVML Track and Composition

Status: first executable contract candidate; public freeze is gated by
[`track-expressiveness.md`](./track-expressiveness.md).

## Law

Except for the shared ProgramSpace and canvas geometry, every audiovisual contribution entering a
Composition is a peer Track. Composition validates, orders and combines Tracks. It does not know
Caption, Speech, B-roll, Text, Seedance or any author-package family.

```text
Speech visual ───────────────> VisualTrack ─┐
B-roll ──────────────────────> VisualTrack ─┤
TimedCaption + style/cues ───> VisualTrack ─┤
Text + style ────────────────> VisualTrack ─┼─> Composition
Vignette / overlay ──────────> VisualTrack ─┤
Speech audio / BGM / SFX ────> AudioTrack ──┘
```

## ProgramSpace

ProgramSpace owns duration and exact rational frame rate. Its duration must end on an integer frame
boundary. A Track does not copy a ProgramSpace digest into every value. The graph connects the Track
and ProgramSpace explicitly wherever their relationship is validated; the validator rejects frame
windows outside that supplied space.

Canvas width, height and clear color are structural Composition facts. No video Track defines
duration or becomes a privileged Base.

## VisualTrack

A VisualTrack is one self-contained render contribution owned by an author package. It explicitly binds the
[`svml.visual-ir@1`](./visual-ir.md) terminal language and owns zero or
more frame-exact `VisualPresent` values; every Present owns its own absolute `(order, tieBreak)`
stacking key and one self-contained, code-free element tree made from box, text, ordinary media and
typed compositable-Surface primitives. Parent references are Present-local. Media and exact font
faces enter through content-addressed Artifact references rather than CSS URLs or environment font
names.
Its ProgramSpace identity is intrinsic because the Track cannot be interpreted without a clock.
Which Records produced it is Graph/Derivation truth and is deliberately absent from the Track.

Composition flattens Presents across every Track before ordering them. One B-roll package may
therefore own a board at z=30 and an icon at z=80 while a Text Present from another Track sits at
z=50. A z change over time is represented by two non-overlapping Presents with different stacking
keys. Track ownership never creates a render stacking context or a provenance chain.

Every element may optionally carry frame-exact local keyframes over opacity, transform, filter or
clip-path. Those keyframes operate only on that Present's element tree. A B-roll package may lower a
pair transition into complementary animations on two of its own Presents without teaching
Composition the name or semantics of that transition.

VisualTrack deliberately has no:

- family or source-kind field;
- sibling Track or Present reference;
- arbitrary script or global CSS selector;
- backdrop filtering or blend mode that samples lower Tracks;
- cross-Track mask, intersection or transition input.

A local filter, crop, transform, animation or transition is valid when it operates only on materials
explicitly owned by the authoring package and lowers to self-contained Presents. An effect that needs
two raw materials must receive both explicitly before final Track lowering. No Present may sample
the accumulated lower composite.

## AudioTrack

An AudioTrack owns frame-exact clips, typed Artifacts, playback mapping, gain, fades and an optional
mix bus. It has no visual stacking key and no special relationship to a Speech Track. Speech audio,
music, source audio and sound effects use the same contract.

## Composition

Composition contains one canvas and a set of VisualTrack/AudioTrack values. ProgramSpace is a peer
input edge to Film and final-render Operations rather than repeated lineage metadata. Composition:

1. validates every Track against the ProgramSpace supplied by an explicit graph edge;
2. rejects duplicate Track identities and duplicate visual stacking keys;
3. flattens every VisualPresent and mounts it by absolute `(order, tieBreak)`;
4. mixes AudioTrack clips in ProgramSpace;
5. produces a renderer-neutral input for an explicitly selected final-render package.

Composition must not switch on an author-domain family or grant a Track special access to accumulated
lower pixels. A global shatter, adjustment layer, Base FX lane or B-roll underlay transition is
therefore not part of this version. No dedicated Base FX placeholder is reserved.

TimedCaptionProjection remains an intermediate semantic value. Caption grouping, style and cue
lowering must finish before the caption enters Composition as an ordinary VisualTrack.

## Final-render boundary

`@narratage/hyperframes` is the current reference compiler for Composition and its one versioned
SVML Visual IR. It never
switches on Speech, Caption, B-roll or author-package identity. It deterministically emits a
content-addressed `HyperframesDocument` whose HTML interleaves VisualPresents by absolute stacking
key. It must not mount an authoring Track as one isolated visual wrapper. AudioTrack compilation
and final mux are separate media operations over the same ProgramSpace; HyperFrames is a silent
visual target.

This is not an exclusive boundary. A future `render-remotion` or API-backed render package may
consume the same Composition and ProgramSpace, compile another immutable renderer document and
return the same media contract. Author Source selects that path by importing its package; Core and
Runtime do not guess a renderer. The current examples select `render-hyperframes` explicitly.

The document MUST bind exact rational frame rate, positive integer frame count, canvas dimensions,
Artifact set and generated HTML. ProgramSpace relationship remains visible in the Producer's input
edges and Derivation rather than being copied into document content. Its complete visual frame domain is the
half-open interval `[0, frameCount)`. Rendering frame `n` must depend only on this immutable document,
its exact Artifacts, the locked renderer implementation and `n`; it must not require sequentially
evaluating frames `0..n-1`. Stateful author effects must therefore be materialized into a typed
Surface before entering this boundary.

Frame partitioning is Runtime policy. A conforming Endpoint may split the domain into any set of
non-overlapping half-open spans whose ordered union is `[0, frameCount)`, evaluate them locally or
remotely, retry individual spans, then assemble visual chunks and mux audio once. Those spans are
not author declarations, Core Operations or Track identities. The fulfilled render Product must
repeat the exact document/frame-domain/canvas bindings; affinity rejects a result assembled for a
different domain.

The compiled document contains `svml-artifact://` placeholders, not local paths, API URLs or signed
URLs. Resolving those placeholders is a Runtime/Provider action immediately before rendering. Thus
one compiled document can be rendered locally or remotely without changing author intent or its
compiled identity. Exact text becomes generated `@font-face` rules with font synthesis disabled.
Typed Surfaces preserve declared dimensions, color space, alpha mode and still/frame timing across
the same Artifact boundary; they are not inferred from filename extensions.

`@narratage/film` implements package-level arbitrary-arity assembly as a finite immutable TrackSet
fold followed by ordinary Composition. Rendering is a separate explicitly imported downstream
Fragment. Core receives only fixed-port, single-result Operations, and targeting an intermediate
Track or Composition does not demand a renderer. The Film Surface must lower into the implemented
Fragment without adding Track families to Core or making one Track depend on accumulated sibling
pixels.
