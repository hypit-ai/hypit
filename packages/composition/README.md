# `@hypit/composition`

Provider-neutral visual and audio Track contracts and their final Composition.

## VisualTrack

`sealVisualTrack` accepts `id`, `programSpaceId`, `visualIr: VISUAL_IR_V1` and `presents` and returns
a value with `kind: "visual"`. `assertVisualTrackIdentity(track, space)` also checks it against a
specific ProgramSpace. Both functions are exported from this package.

Each Present supplies:

| Field | Meaning |
| --- | --- |
| `id`, optional `subjectId` | Appearance identity and, when useful, the domain entity it depicts |
| `span` | `{ startFrame, endFrameExclusive }` in program frames |
| `stacking` | `{ order, tieBreak }`, absolute paint order across Presents |
| `elements` | One rooted element tree owned by the Present |

Higher stacking order paints later. Element `order` values are distinct within a Present and
determine order inside its tree. A child names
its `parent`; its position is relative to that parent. Root positioning is relative to the Canvas.
Animation keyframes use `atFrame` offsets from the Present's start. Media sampling targets use the
same local frame origin and map to exact source frames.

The exported `VisualElement` union covers `box`, `mask`, `text`, `text-flow`, `path-text`, `image`,
`video` and `surface`. Text carries exact FontArtifactRef values; images and videos carry BlobRefs;
`surface` carries a CompositableSurfaceRef. The schema and exported TypeScript types in `src/track.ts`
give each shape. `hypit vocabulary --visual visual-track` and focused element queries expose those
schemas through the installed Distribution.

## AudioTrack

An AudioTrack contributes explicit clips with source audio artifacts, source sample ranges, target
sample ranges, gain, fades and playback. Target positions use the ProgramSpace's canonical 48 kHz
sample domain. Use `programSpaceSampleFrames` and the temporal/media helpers when converting an
authored event into that domain. Source timing and target timing are separate.

`sealAudioTrack` and `assertAudioTrackIdentity` are the corresponding public constructors/checks.
An Author Package can publish visual and audio Tracks as separate Outputs; the composition includes
each selected Output explicitly.

## Composition

A Composition carries its id, Canvas with clear color, and peer Tracks. The Tracks retain their
ProgramSpace identity; assembly and rendering receive the corresponding time domain separately.
`@hypit/film` is one author-facing way to assemble it;
`@hypit/render-hyperframes` consumes it to produce a video.
