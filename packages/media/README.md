# `@narratage/media`

Author-facing media declarations for the neutral `@narratage/media` contract module.

`<media:Image>`, `<media:Audio>` and `<media:Font>` request bytes through the Host-owned source-asset
capability. Image and Audio emit one content-addressed `BlobArtifact`; Font wraps the same immutable
bytes with exact weight/style metadata as a one-source `FontArtifactRef`. A logical font face may
also contain several exact Unicode-range sources when another package, such as
`@narratage/fonts-open`, owns a sharded installed font. `FontStackRef` is the generic ordered value
for one primary face followed by exact glyph fallbacks. Media declarations do not open files themselves,
inspect media, call a Provider or promote declared audio to speech. The consuming author package
decides whether an audio artifact is a voice reference, soundtrack, evidence source or something
else, and which visual component uses an exact Font.
