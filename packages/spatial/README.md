# `@hypit/spatial`

Shared video-domain geometry: explicit Canvas coordinates, Points, Frames, Paths, externally measured
Region Timelines, intrinsic extents and deterministic two-frame content fitting. It owns no semantic
timing, Paint, motion, media decoding,
renderer, Provider or Core behavior.

The package exposes self-described `Canvas`, `Point`, `Path`, `Extent`, `RegionTimeline`, `Frame`,
`AnchoredFrame` and `AspectFrame` author Surfaces plus pure geometry functions and fixed-port Producers.

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
