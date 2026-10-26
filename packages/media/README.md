# `@hypit/media`

Author-facing media declarations for the neutral `@hypit/media` contract module.

`<media:Image>`, `<media:Audio>`, `<media:Video>` and `<media:Font>` request bytes through the Host-owned source-asset
capability. Image, Audio and Video emit one Resource-backed `Blob`; Font wraps the same immutable
bytes with exact weight/style metadata as a one-source `FontArtifactRef`. A logical font face may
also contain several exact Unicode-range sources when another package, such as
`@hypit/fontsource`, adapts a sharded installed font. `FontStackRef` is the generic ordered value
for one primary face followed by exact glyph fallbacks. Media declarations do not open files themselves,
inspect media, call a Provider or promote declared audio to speech. The consuming author package
decides whether an audio artifact is a voice reference, soundtrack, evidence source or something
else, whether a video is a generation reference or another input, and which visual component uses
an exact Font.

The same module owns `PreparedMedia`: one immutable source Blob, one exact finite local domain and
the selected visual/audio members' exact maps back to source presentation time. Visual interpretation
retains coded extent, sample aspect ratio and rotation; audio interpretation retains its sample and
channel facts. Decoding, Film placement, semantic evidence, renderer choice and
Provider cache remain separate downstream values.

## Prepared media stays neutral

Preparation also publishes a complete exact `LocalTemporalDomain` and clock-independent
`TemporalExtent`. A Timeline may resolve the Extent on its own Clock to determine its end, and a
semantic projector may use the Domain with a placed Window to publish absolute anchors. Neither
operation changes the media's identity or wraps it in an A-roll-specific value.

Visual and Audio author Clips each accept the same ordinary `PreparedMedia` with an explicit
absolute Window. Each Clip contributes its own exact occurrence-to-prepared sampling relation. Visual lowering projects
the selected visual stream and carries the composed relation into `HtmlProgram`; audio lowering carries the prepared source and
its preparation relation into the terminal Audio Track, while `AudioProgram` lowers those audio-only facts onto samples. A media value is therefore equally
usable as foreground performance, B-roll, music, an effect or a model input; its earlier contribution
to Timeline construction is not observable downstream.

`PreparedVisualSource` and `PreparedAudioSource` are signal-specific projections of source selection and interpretation.
They choose no file format, frame grid, sample buffer, decoder or cache. A renderer may decode, cache or transcode privately,
but those choices do not become graph values or fields of `PreparedMedia`.

## Terminal delivery

`VisualPictureSpec` is the common picture vocabulary: color interpretation, bit depth and alpha/matte
policy. Its supported values remain exact rather than freely combinable: encoded video currently uses
`VideoPictureSpec` for BT.709 limited range, while PNG frame capture uses `ImagePictureSpec` for sRGB full
range. `MediaDeliverySpec` is the author-owned requirement for one finished file. It declares the picture
profile and matte policy, coded video target, audio target and container once. The pure
`project-visual-delivery` Producer derives the `VisualDeliverySpec` needed by a visual renderer;
the complete value independently reaches final mux.

`TimelineVisual` records the exact visual requirement implemented by its encoded Artifact.
`TimelineAudio` records its PCM sample rate, channel layout and sample count. `MuxedMedia` records
the complete delivery requirement. Final mux rejects inputs prepared for a different requirement;
it does not silently transcode them or recover policy from a Provider configuration.

These values do not contain encoder names, hardware choices, browser selection, texture handles,
worker counts or cache budgets. Such facts belong to the selected Provider and Runtime Profile.
The currently supported delivery family is opaque BT.709 limited-range 8-bit H.264/yuv420p video,
48 kHz stereo AAC audio and MP4; unsupported requirements fail explicitly rather than being
approximated.

## Font files

`Font` takes an explicit source path and the selected face's real weight and style:

```svml
<media:Font id="caption-font" src="./assets/fonts/creator-bold.otf" weight="700" style="normal"/>
```

The source can be a project font, a user-supplied file, or an npm package resource such as
`package:@company/brand-fonts/files/brand.woff2`. The Host stages its bytes as an ordinary resource;
the render machine does not need that font installed.
Project-relative assets make the Source portable. The supported filename extensions are `.ttf`,
`.otf`, `.woff` and `.woff2`. The Surface has no selector for a face within a `.ttc`/`.otc` collection;
use the intended standalone face. Weight/style metadata describes that face, not a synthetic transform.

Caption Fine and Typography Styles can consume this value as their primary `font` or an explicit
Fallback face. `@hypit/fontsource` adapts only packages the project explicitly installs; Media
does not carry a font catalog or limit which package and project-owned files an author may supply.

A face split across Unicode ranges uses `Source` children. A stack is a separate, generic value:

```svml
<media:Font id="latin" src="package:@company/type/files/latin.woff2" weight="600" style="normal"/>
<media:Font id="han" weight="600" style="normal">
  <media:Source src="./assets/fonts/han-1.woff2" unicode-range="U+4E00-9FFF"/>
</media:Font>
<media:FontStack id="caption" primary={latin}>
  <media:Fallback font={han}/>
</media:FontStack>
```
