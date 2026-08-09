# `@narratage/spatial`

Shared video-domain geometry: explicit Canvas coordinates, Points, Frames, Paths, intrinsic extents
and deterministic two-frame content fitting. It owns no timing, Paint, motion, media decoding,
renderer, Provider or Core behavior.

The package exposes self-described `Canvas`, `Frame`, `AnchoredFrame` and `AspectFrame` author
Surfaces plus pure geometry functions and fixed-port Producers. See
[`../../spec/spatial-layout.md`](../../spec/spatial-layout.md).
