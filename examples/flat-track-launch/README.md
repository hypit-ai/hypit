# Flat Track Launch architecture fixture

This source is the readable fixture for the unimplemented Source Architecture
Draft. It deliberately exercises contracts that the current v1 compiler does not
yet accept:

- Script Surface v2 independent Segment endpoints (`2M + 2N`);
- a Basis Component that overlaps adjacent Segment media;
- a separately locked Locator that produces the ExactSemanticMap;
- one ProgramBasis and one absolute ProgramSpace;
- flat visual/audio Track contributions with no Track nesting;
- continuous A-roll source mapping across overlapping Present windows;
- B-roll transition audio inside the B-roll Track;
- disconnected caption selections, Moments and manual ProgramSpans;
- Film as the sole `Track[]` consumer.

The `@svml/std/*` imports and local assets are illustrative package paths. The
adjacent `launch.svs` makes every ProgramSpace placement explicit. Do not use this
fixture as the executable regression until the flat Track milestone lands; use
`../regen-ranking/regen-ranking.svml` for the current compiler.
