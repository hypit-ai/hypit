# Drawing a component

Read this while implementing a project component's rendered output. [Track authoring](track-authoring.md)
owns its author interface, temporal inputs and state behavior. [Spatial layout](spatial.md) explains
the incoming geometry; [Studio](studio.md) explains an optional Companion.

## From program to visible Track

A component's drawing output describes what appears, where it appears and how it changes over its
visible lifetime. For a reveal card, those decisions become a box and text, a destination Frame,
an entrance animation and the interval for which the answer remains visible.

A component can first compute a domain program, such as a list of answers and their reveal times.
Its drawing Producer receives that program, ProgramSpace, Frames, Style and explicit assets, then
returns a VisualTrack. A simple component can produce the Track directly when no separate program
would help its behavior or editing.

The public representation has these parts:

| Part | What it means |
| --- | --- |
| Track | Named picture contribution belonging to one ProgramSpace |
| Present | An independently timed and stacked appearance |
| `span` | Program frames from `startFrame` through the frame before `endFrameExclusive` |
| `stacking` | Absolute paint order among Presents; higher order appears above lower order |
| Elements | One rooted tree of boxes, text, media, masks or compositable surfaces |
| Animation | Keyframes relative to the containing Present's start |

Use several Presents when items have separate lifetimes or stacking positions. A persistent board
can keep its settled rows visible while later rows enter. Its domain program decides those spans
and states; the drawing output makes them explicit.

## A working drawing function

[visuals.ts](examples/visuals.ts) contains `renderCard`, a complete pure drawing function using
`sealVisualTrack` from `@hypit/composition`. It receives a projected span and a resolved Frame,
draws a colored box with exact-font text, and optionally fades in relative to the Present's start.
Its colors, size, padding, layer and entrance duration are supplied by the caller.

The root uses Canvas coordinates. The text child uses the root's local coordinates, so padding is
added once. When a component computes child geometry in Canvas space, subtract the parent's origin
before writing child `left` and `top`.
Element `order` values are distinct within the Present; `stacking.order` separately places that
whole Present among the composition's other appearances.

The function is the drawing part of a package. Connect it to a Producer with matching typed inputs,
then publish the Track through the Fragment and Surface as described in
[Track authoring](track-authoring.md#connect-the-implementation-at-its-real-boundaries). Surface outputs
map the Fragment's export name to a public Source name such as `answers.track`.

Use `programSpaceFrameCount` from `@hypit/program-space` for the full program's frame count and
`assertVisualTrackIdentity(track, space)` to check a produced Track against that space. Direct seeking
and range rendering evaluate the same declared keyframes at the requested frame.

## Elements, fonts and other assets

`box` provides a container or painted shape. `text`, `text-flow` and `path-text` carry text and exact
font resources. `image` and `video` reference their media artifacts. A `mask` names owned mask and
content children in the same Present. The installed vocabulary queries expose their value shapes:

```bash
hypit vocabulary --visual visual-track
hypit vocabulary --visual text
```

Visual styles use the supported CSS-shaped property vocabulary. Motion currently interpolates
`opacity`, `transform`, `filter` and `clip-path` through frame-indexed keyframes. Media sampling
separately describes which source frame to show at each part of a Present; it is needed for timed
video playback, trims, loops and holds. Existing Media Track is useful when that is the whole role.

Carry asset and font references through declared inputs. Source assets can be resolved at the
Surface's asset boundary; generated media remains a graph reference until its Producer runs.
The drawing function receives those values. For a visual preparation that reads bytes or invokes an
external tool, use its preparation capability and pass the resulting material into drawing.

## Compose externally prepared pixels

A `surface` element accepts a CompositableSurfaceRef: prepared pixels with explicit extent, color,
alpha and, for animation, frame information. This is useful when the component uses a raster or
animated asset produced by another tool. Its preparation determines the pixels; the Track determines
placement, sampling and lifetime.

For an effect that transforms an image, pass that image as an explicit input to the effect's
preparation. For a local mask, own the mask and content in the same element tree. These relationships
make the required materials available both in Studio and in a render of any selected interval.
