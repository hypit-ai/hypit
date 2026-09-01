# `@hypit/media`

Author-facing media declarations for the neutral `@hypit/media` contract module.

`<media:Image>`, `<media:Audio>`, `<media:Video>` and `<media:Font>` request bytes through the Host-owned source-asset
capability. Image, Audio and Video emit one Resource-backed `BlobArtifact`; Font wraps the same immutable
bytes with exact weight/style metadata as a one-source `FontArtifactRef`. A logical font face may
also contain several exact Unicode-range sources when another package, such as
`@hypit/fonts-open`, owns a sharded installed font. `FontStackRef` is the generic ordered value
for one primary face followed by exact glyph fallbacks. Media declarations do not open files themselves,
inspect media, call a Provider or promote declared audio to speech. The consuming author package
decides whether an audio artifact is a voice reference, soundtrack, evidence source or something
else, whether a video is a generation reference or another input, and which visual component uses
an exact Font.

The same module owns the deliberately narrow `SynchronizedMedia` contract used after technical
normalization. It contains one common `frameRate`/`frameCount`, an optional visual Artifact with its
intrinsic pixel extent, and an optional audio Artifact. Source stream indexes, selection authority,
normalization ledgers and repeated codec/rate constants are not downstream media fields.
