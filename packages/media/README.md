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

## Font files

`Font` takes an explicit source path and the selected face's real weight and style:

```svml
<media:Font id="caption-font" src="./assets/fonts/creator-bold.otf" weight="700" style="normal"/>
```

The source can be a project font, a user-supplied file, or an installed font's file path. The Host
stages its bytes as an ordinary resource; the render machine does not need that font installed.
Project-relative assets make the Source portable. The supported filename extensions are `.ttf`,
`.otf`, `.woff` and `.woff2`. The Surface has no selector for a face within a `.ttc`/`.otc` collection;
use the intended standalone face. Weight/style metadata describes that face, not a synthetic transform.

Caption Fine and Typography Styles can consume this value as their primary `font` or an explicit
Fallback face. `@hypit/fonts-open` offers bundled faces through the same media types; its catalog
does not limit which external fonts an author may supply.
