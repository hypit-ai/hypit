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

Media's syntax-neutral Author declarations own these fields, conditional Font shape, asset requests,
reference Types and output Records. Markup contributes only the Image, Audio, Video, Font and
FontStack spellings, plus `WorkingPicture` for an explicitly authored Composition space. Asset resolution remains an explicit compiler capability, and FontStack may
reference authored Font Records regardless of their textual order.

The same module owns `PreparedMedia`: one immutable source Blob, one exact finite local domain and
the selected visual/audio members' exact maps back to source presentation time. Visual interpretation
retains coded extent, sample aspect ratio, rotation and the complete `PictureInterpretation` selected
for those samples; audio interpretation retains its sample and channel facts. Decoding, Film placement, semantic evidence, renderer choice and
Provider cache remain separate downstream values.

`PictureInterpretation` is shared by still images, selected video streams and compositable Surfaces.
It states primaries, transfer, matrix, range, source sample bit depth and alpha semantics. Sharing this
value does not give a still image a source clock or erase a video's local domain: it unifies what the
pixels mean, not how time is represented. `PictureObservation` is the incomplete inspection form;
Preparation must resolve it to a complete interpretation from source tags or an explicit author
profile before publishing prepared picture.

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

`PictureSignal` is the common source and delivery signal vocabulary. `WorkingPictureSpec` separately
states the Composition working primaries, transfer, reference white and alpha model. A Program carries
that same value; it does not establish a second picture authority. Internal
float precision belongs to a Provider implementation rather than either value. `OutputPictureSpec`
describes a delivery picture: encoded video uses `VideoOutputPictureSpec`, while PNG frame capture uses
`FrameOutputPictureSpec`. `MediaDeliverySpec` is the author-owned requirement for one finished file. It declares the picture
profile and matte policy, coded video target, audio target and container once. The pure
`project-visual-delivery` Producer derives the `VisualDeliverySpec` needed by a visual renderer;
the complete value independently reaches final mux.

`TimelineVisual` records the exact visual requirement implemented by its encoded Artifact.
`TimelineAudio` records its PCM sample rate, channel layout and sample count. `MuxedMedia` records
the complete delivery requirement. Final mux rejects inputs prepared for a different requirement;
it does not silently transcode them or recover policy from a Provider configuration.

These values do not contain encoder names, hardware choices, browser selection, texture handles,
worker counts or cache budgets. Such facts belong to the selected Provider and Runtime Profile.
The common values can express wider-gamut and higher-bit-depth requirements without claiming an
implementation. The local HTML Chromium Endpoint supports opaque BT.709 limited-range 8-bit
H.264/yuv420p delivery. Its explicitly selected Electron implementation additionally supports one
closed HDR10 family: linear BT.709 working values with explicit reference white and opaque
BT.2020/PQ/BT.2020-NCL limited-range HEVC Main10 delivery. Audio delivery remains 48 kHz stereo AAC
and the finished container remains MP4. Unsupported combinations fail explicitly rather than being approximated.

An author can name the working picture and final delivery independently:

```svml
<media:WorkingPicture id="hdr-working" color-primaries="bt709"
  color-transfer="linear" reference-white-nits="203"/>
<media:HdrStaticMetadata id="hdr-metadata"
  red-x="0.708" red-y="0.292" green-x="0.170" green-y="0.797"
  blue-x="0.131" blue-y="0.046" white-x="0.3127" white-y="0.3290"
  min-luminance-nits="0.005" max-luminance-nits="1000"
  max-content-light-nits="1000" max-frame-average-light-nits="400"/>
<media:Delivery id="hdr-delivery" profile="hdr10-hevc" quality="high"
  hdr-static-metadata={hdr-metadata}/>
```

`WorkingPicture` is only Composition semantics. `Delivery` is the author-owned finished-file
requirement. The `hdr10-hevc` profile requires explicit mastering-display and content-light metadata;
the Provider writes and verifies those values and never derives them by scanning the work. Neither
declaration selects Electron, an encoder or a display mode. Runtime binding selects an Endpoint that
can implement the complete request.

## Font files

`Font` takes an explicit source path and the selected face's real weight and style:

```svml
<media:Font id="caption-font" src="./assets/fonts/creator-bold.otf" weight="700" style="normal"/>
```

The source can be a project font, a user-supplied file, or an npm package resource such as
`package:@company/brand-fonts/files/brand.woff2`. The Host stages its bytes as an ordinary resource;
the render machine does not need that font installed.
Project-relative assets make the Source portable. The supported filename extensions are `.ttf`,
`.otf`, `.woff` and `.woff2`. The declaration has no selector for a face within a `.ttc`/`.otc` collection;
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
