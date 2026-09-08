# `@hypit/spatial`

Shared video-domain geometry: explicit Canvas coordinates, Points, Frames, Paths, externally measured
Region Timelines, intrinsic extents and deterministic two-frame content fitting. It owns no semantic
timing, Paint, motion, media decoding,
renderer, Provider or Core behavior.

The package exposes self-described `Canvas`, `Point`, `Path`, `Extent`, `RegionTimeline`, `Frame`,
`AnchoredFrame` and `AspectFrame` author Surfaces plus pure geometry functions and fixed-port Producers.

## Destination and fitted content

`SpatialFrame` is a destination rectangle in Canvas pixels. `IntrinsicExtent` supplies source
dimensions. `fitContent(frame, extent, fit)` returns a `FittedContent.contentFrame`: the scaled
source's rectangle in the same coordinates. The caller supplies the fitting area; Media Track
derives that area by subtracting its border and padding from its outer Frame.

`ContentFit.sizing` selects the size before alignment:

| Sizing | Result |
| --- | --- |
| `contain` | Preserve aspect and fit both dimensions inside the destination |
| `cover` | Preserve aspect and cover both destination dimensions |
| `fit-width` / `fit-height` | Preserve aspect and match the named dimension |
| `native` | Keep the source's pixel dimensions |
| `scale-down` | Use `contain` while limiting scale to at most 1 |
| `stretch` | Use the destination width and height independently |

`framePoint` and `contentPoint` are separate normalized points in `[0,1]`. The scaled source point
is placed at the destination point, then `offsetPx` is added. Before any constraint, the horizontal
position is `frame.xPx + frame.widthPx * framePoint.x - contentWidth * contentPoint.x + offsetPx.x`;
the vertical position follows the same relationship.

`constraint: bounded` clamps each coordinate between `frameStart` and
`frameStart + frameSize - contentSize`, whichever is lower or higher. Large content keeps the
destination covered on that axis, and small content stays inside it. `free` leaves the calculated
position unchanged. Fitting calculates rectangles; the consuming component owns clipping.

`decodeContentFitProperties` exposes these through Recipe keys: `fit`, `frame-x`, `frame-y`,
`content-x`, `content-y`, `fit-offset-x`, `fit-offset-y`, and `fit-constraint`. Defaults are `contain`,
center points (`0.5`), zero pixel offsets and `bounded`. These alignment fractions place the source
inside the supplied destination. Canvas placement remains the job of Frame / AnchoredFrame /
AspectFrame. Media Track and Speech Track use this same decoder.

## Measured regions

`RegionTimeline` accepts already measured data rather than running a detector. Face detection and
tracking can observe the footage produced by an earlier Build: keep useful boxes as ordinary numbers,
then reuse that media while rendering Caption with the finished timeline. Measurement precedes the
composition that consumes it; it need not precede the first media-producing Build. RegionTimeline
does not start a detector to discover its own layout. One SVS Recipe holds the exact ProgramSpace
frame count and named tracks whose array positions are Frames:

```svs
heads.default {
  frame-count: 3;
  tracks: [
    {"id":"WIFE","regions":[[0.12,0.09,0.20,0.26],null,[0.13,0.10,0.20,0.26]]}
  ];
}
```

```svml
<space:RegionTimeline id="heads" within={vertical} recipe={tracking.heads.default}/>
```

Every measured region is normalized `[x, y, width, height]`; `null` says that this track has no
measured region on that Frame. The Surface converts measured regions to the selected Canvas's pixels
at author time; it never fills missing Frames or interprets a track id.

Prepare measurements against the exact edited media, clock and Canvas used by the composition.
Individual Take measurements need their actual frame offsets in the program; boxes measured before
a crop, resize or inset need that placement transform. Face-to-head expansion, identity association,
cut handling and any interpolation are explicit external preparation decisions. The resulting
Recipe records their output. Caption consumers can assign Role meaning to track ids without making
Spatial aware of speakers, detector APIs or generated-media Providers.
