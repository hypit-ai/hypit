# `@hypit/composition`

Provider-neutral visual and audio Track contracts and their final Composition.

Composition also owns the terminal structural visual vocabulary identified by `VISUAL_IR_V1`,
including its supported CSS-shaped declarations and validation. There is no peer Visual IR Module:
the vocabulary versions the visual representation carried by `VisualTrack`, while richer renderer
program payloads remain explicitly owned by their rendering package.

## VisualTrack

`sealVisualTrack` accepts `id`, `timelineId`, `visualIr: VISUAL_IR_V1` and one ordered `items` union,
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
| `root` | One recursive element tree owned by the Present |

The parent VisualScope's member array paints from back to front. Items inside one Track use the same
array law. Neither member id nor item id is a hidden paint-order fallback. The member id forms a
recursive occurrence path through nested Stacks; Track `id` remains the identity of the reusable value.
The same Track may therefore be placed more than once without being rewritten. Element children are
recursive values rather than parent references; each child position is relative to its containing
element, while the Present root is relative to the Canvas.
Animation keyframes use `atFrame` offsets from the Present's start. Timed media carries an exact
occurrence-local `TemporalMap`; terminal visual compilation alone resolves it onto decoded frames.

The exported `VisualElement` union covers `box`, `mask`, `text`, `text-flow`, `path-text`, `image`,
`video`, `surface` and `program`. Text carries exact FontArtifactRef values; images and videos carry BlobRefs;
`surface` carries a CompositableSurfaceRef. The schema and exported TypeScript types in `src/track.ts`
give each shape. `hypit vocabulary --visual visual-track` and focused element queries expose those
schemas through the installed Distribution.

A `program` carries `{ format, payload, artifacts }`. The rendering package owns the object payload
and supports named formats. It may place typed children in named slots, so video, text
and graphics can share behavior while retaining explicit material dependencies. The parent
relationship remains structural inside the Present; internal layout belongs to that program.

A `VisualProcess` uses the same programme carrier but its named inputs are complete Present or nested
Process contributions, not element slots. Each input therefore retains its own absolute span, local
animation origin and media sampling relation. This is the terminal boundary for multi-picture operations
such as a two-shot transition; the package that creates the process owns the input-role names and payload.

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

A Composition carries its id, Canvas with clear color, a recursive `VisualScope`, and root
`AudioTrack[]`. A visual Scope contains placed Track members and nested Stack members. Both member
kinds carry a sibling-unique `id`, and their array order paints from back to front. Their recursive
path identifies one visual occurrence. Each Stack closes its children into one picture before entering
its parent at that position. Audio outputs form a finite multiset of
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
