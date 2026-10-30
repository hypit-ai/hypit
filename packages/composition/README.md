# `@hypit/composition`

Provider-neutral visual and audio Track contracts and their final Composition.

Composition owns renderer-neutral visual structure: Present, Process, Adjustment, VisualScope,
typed media/text/Surface/Composition leaves and the generic Programme envelope. It does not publish
DOM nodes, CSS properties, HTML attributes or renderer keyframes. Those values and their validation
belong to the package that owns a Programme format.

## VisualTrack

`sealVisualTrack` accepts `id`, `timelineId` and one ordered `items` union,
and returns a value with `kind: "visual"`. `sealPresentVisualTrack` is the narrow constructor for the
common Present-only subset; its `presents` input is construction syntax, while the returned terminal
value still contains `items`. `assertVisualTrackIdentity(track, timeline)` checks either form of item
against a specific Timeline. The constructors preserve the discriminated union at the JavaScript
boundary: a missing `items` array, an unknown item `kind`, or a non-Present kind supplied to the
Present-only constructor is rejected rather than reclassified.

Every Visual Item shares `id`, optional `subjectId`, `span` and optional `visibility`. Its position in
the Track's item array is its paint position.
Its `kind` preserves ownership distinctions a consumer cannot infer:

- `present` owns new source pixels in one recursive `root` tree and composites them onto the picture;
  its declared blend may also consult the backdrop;
- `process` owns named, independently timed `VisualContribution` inputs and a
  `{ format, payload, artifacts }` programme that combines them into one picture contribution;
- `adjustment` owns a `{ format, payload, artifacts }` programme which transforms the picture already
  accumulated below its stack position.

Process and Adjustment formats belong to their packages and a renderer must explicitly support them.
Composition does not enumerate effects, carry renderer selectors or store lists of affected Tracks.

Each Present supplies:

| Field | Meaning |
| --- | --- |
| `id`, optional `subjectId` | Appearance identity and, when useful, the domain entity it depicts |
| `span` | `{ startFrame, endFrameExclusive }` in program frames |
| `root` | One typed visual value owned by the Present |

The parent VisualScope's member array paints from back to front. Items inside one Track use the same
array law. Neither member id nor item id is a hidden paint-order fallback. The member id forms a
recursive occurrence path through nested Stacks; Track `id` remains the identity of the reusable value.
The same Track may therefore be placed more than once without being rewritten. Mask operands and
Programme slots are recursive values rather than parent references. Programme-local layout and animation
stay inside the package that owns that Programme format. Timed media carries an exact occurrence-local
`TemporalMap`; terminal visual compilation alone resolves it onto decoded frames.

The exported `VisualElement` union covers `mask`, `text`, `text-flow`, `path-text`, `image`,
`video`, `surface` and `program`. Text carries exact FontArtifactRef values. Every image carries a BlobRef
and complete `PictureInterpretation`; video carries a selected `PreparedVisualSource` with the same
picture semantics plus its local temporal facts; `surface` carries a CompositableSurfaceRef with its
declared picture interpretation. The schema and exported TypeScript types in `src/track.ts`
give each shape. `hypit vocabulary --visual visual-track` and focused element queries expose those
schemas through the installed Distribution.

A `program` carries `{ format, payload, artifacts }`. The rendering package owns the object payload
and supports named formats. The generic `artifacts` array is only its graph-visible Blob resource
closure; the owning format must define and validate any purpose, picture interpretation or timing in
its own payload rather than adding a Composition-wide purpose table or asking an executor to infer it.
It may place typed children in named slots, so video, text
and graphics can share behavior while retaining explicit material dependencies. Slot names express
roles, not paint order. Internal layout, CSS and animation belong to that program.

A Track-level `VisualProcess` holds a `VisualProcessEffect` and named inputs that are complete Present or nested
Process contributions, not element slots. The effect declares the exact input-port names and its package-owned
programme; Composition requires the occurrence inputs to match that contract. Each input therefore retains its
own absolute span, local animation origin and media sampling relation. This is the terminal boundary for
multi-picture operations such as a two-shot transition without turning port names into renderer convention.

A Scope-level Process is a structural member alongside Track and Stack. Its named inputs are complete
recursive VisualScopes, and its `VisualProcessEffect` declares the exact port names and package-owned
programme. The Process consumes those private input Pictures and contributes one Picture at its own
position in the parent Scope. This is the generic boundary used by sibling matte; Composition does not
name matte channels or infer relationships from adjacency.

## AudioTrack

An AudioTrack is one closed, single-output `AudioSignalGraph`. Its terminal nodes are deliberately
small: `silence`, source `AudioClip`, additive `mix`, and package-owned `process`. References name an
explicit node and signal port. The graph must be acyclic, every reference must resolve, and every
node must contribute to the declared output; Composition does not retain disconnected metadata.

Source Clips own only a selected `PreparedAudioSource`, its preparation relation, exact absolute target ranges,
exact partial temporal sampling maps, gain and fades. Unrelated visual and container-selection facts stop at
the Audio Track boundary. A terminal audio compiler resolves preparation, target, sampling and fade boundaries onto
its 48 kHz execution domain together. Process formats own
their payload and input-port semantics; Composition carries and validates only the common programme
envelope rather than maintaining an effect catalogue.

`audioGraphFromClips` constructs the common source-plus-mix subset. `sealAudioTrack` and
`assertAudioTrackIdentity` are the corresponding public constructors/checks, while
`audioTrackClips` is an observation helper for consumers that need to enumerate source leaves. An
author package can therefore publish an AudioTrack without teaching Film or Core about its routing.

## Composition

A Composition carries its id and two independently consumable terminal values:
`VisualComposition { canvas, root }` and `AudioComposition { contributions }`. Source picture
interpretations remain on their visual inputs, while final delivery stays on its terminal request;
Composition does not advertise a selectable working colour space. The two programmes share the
Timeline connected to assembly, but a visual compiler does not receive audio routing and an audio
compiler does not receive Canvas or VisualScope. A visual Scope contains placed Track members, nested Stack members and
named-input Process members. Every member carries a sibling-unique `id`, and array order paints from back to front.
Its recursive path identifies one visual occurrence. Each Stack closes its children into one Picture before entering
its parent; each Process closes its named input Scopes through one effect and likewise contributes one Picture.
Audio outputs form a finite multiset of
independent closed graphs and are additively combined at the Film root. Repeated signals and equal
AudioTrack ids are valid; the Track id describes the reusable value, not a root routing key. The Tracks retain
their Timeline identity; assembly and rendering receive the corresponding Timeline separately.
`@hypit/film` is one author-facing way to assemble it;
`@hypit/html-video` consumes it to produce a video.

### Visibility without a new sampling origin

A VisualPresent or VisualProcess may supply `visibility`, an ordered list of non-overlapping subranges in program
frames, all inside its `span`. Omission means the full span; an empty list means never visible.
`span` continues to define local animation and media-sampling time. This permits rule overrides or
other partial visibility without cutting a program into restarted copies. The `HtmlProgram` applies
visibility independently at each requested frame; custom HTML and typed media keep their original clocks.

## Audio level automation on the program clock

AudioClip optionally carries level automation as `gainEnvelope: { sample, gain }[]` and
`audibility: { startSample, endSampleExclusive }[]`. Both use absolute 48 kHz program samples.
Envelope points have strictly increasing sample positions and interpolate linearly, holding the
outer endpoint gains. They multiply the existing Clip gain and fades. Audible subranges are ordered,
disjoint and inside the original target; omission means the whole target, an empty list means silence.
`audioEnvelopeGainAt` evaluates the envelope; `assertAudioLevelAutomation` checks these values.

Original target and source sampling remain intact when a Clip is partially inaudible. Range
rendering applies envelopes and masks before cropping. These fields express generic sound behavior;
multi-Clip relationships such as ducking or crossfades belong to ordinary author components.
