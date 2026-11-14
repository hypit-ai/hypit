# `@hypit/media`

Neutral media values, verification, Producers and representation contracts.

This package owns `PreparedMedia`, picture/audio selection, exact source-domain mappings, media inspection
Needs and terminal delivery values. It does not own a Source language, Author declarations, file tools,
Provider selection or NLE placement. `@hypit/media-author` is the optional Source adapter that spells
`media.image`, `media.audio`, `media.video`, `media.font` and delivery declarations; it lowers them to
the ordinary values and Producers defined here.

Image, Audio and Video remain the same complete media concept after that declaration boundary. A resource
branch can expose immutable bytes while the prepared branch derives selected picture/audio through
`inspect -> select -> prepare`. Target closure keeps those branches lazy, but the branching is a Build fact,
not a property of an NLE media-bin entry. Selecting audio does not promote it to speech; downstream relations
decide whether the signal is a voice reference, soundtrack, evidence source or occurrence.

The same module owns `PreparedMedia`: one identity, one immutable source Blob, an optional exact finite local domain and
selected Picture/Audio members. A constant Picture has no temporal domain or Map. Signal members keep exact maps back to
source presentation time. Picture interpretation
retains coded extent, sample aspect ratio, rotation and the complete `PictureInterpretation` selected
for those samples. Audio preparation retains only the selected stream, exact presentation origin, source domain and Map; decoder input
shape is observed where bytes are decoded instead of being copied through every Programme. Decoding, Film placement, semantic evidence, renderer choice and
Provider cache remain separate downstream values.
Inspection publishes presentation endpoints only when decoded-unit facts establish both boundaries.
Without a complete span, the stream cannot establish an exact local domain; probe diagnostics do not enter this value.

Persistent file import is deliberately a separate owner. `@hypit/media-asset` stores a portable relative media file,
these already resolved preparation facts without an execution `BlobRef`, and zero or more package-owned representation
documents. Loading that manifest projects the file into ordinary `PreparedMedia`; it does not add transcript, object,
depth or analysis kinds to this package and does not run an Analyzer.

## Materializing one selected member

Media also owns explicit audio and decoded-frame materialization. The pure Producer resolves the
ordinary default or explicit stream selector against `MediaInspection`, then emits an `extract-audio`
or `extract-frame` Need. The result is a new WAV or PNG Blob; it does not become PreparedMedia and
does not acquire speech, speaker, first-frame, continuity or editing meaning.

This is the physical branch used when a model or external tool needs one standalone member. The
prepared branch remains the information-preserving path for audiovisual use. Target closure naturally
executes only the branch a consumer requests. Local FFmpeg execution belongs to `@hypit/media-local`;
another Provider may implement the same Media capabilities without changing their meaning.

`preparedPictureExtent` projects those facts to the actual display width and height after pixel aspect
and quarter-turn rotation. It is geometry, not a reduced aspect-ratio pair: a square-pixel 64×64 source
therefore remains 64×64.

`PictureInterpretation` is shared by constant images and selected video streams.
It states primaries, transfer, matrix, range, source sample bit depth and alpha semantics. Sharing this
value does not give a still image a source clock or erase a video's local domain: it unifies what the
pixels mean, not how time is represented. `PictureObservation` is the incomplete inspection form;
Preparation must resolve it to a complete interpretation from source tags or an explicit author
profile before publishing prepared picture.

## Prepared media stays neutral

Signal preparation also publishes a complete exact `LocalTemporalDomain` and clock-independent
`TemporalExtent`. Constant Picture intentionally publishes neither. Any later output sampling grid
resolves exact time without changing media identity or wrapping it in an A-roll-specific value.

Picture and Audio occurrences accept the same ordinary `PreparedMedia`. Each signal use contributes its own exact
occurrence-to-prepared sampling relation. Picture lowering projects
the selected visual stream and carries the composed relation into `HtmlProgram`; audio lowering carries the prepared source and
its preparation relation into the terminal Audio Track, while `AudioProgram` lowers those audio-only facts onto samples. A media value is therefore equally
usable as foreground performance, B-roll, music, an effect or a model input; its earlier contribution
to Timeline construction is not observable downstream.

`PreparedSignalPictureSource` and `PreparedAudioSource` are signal-specific projections of source selection and exact source
domains; only the Picture projection carries pixel interpretation because visual renderers consume it.
They choose no file format, frame grid, sample buffer, decoder or cache. A renderer may decode, cache or transcode privately,
but those choices do not become graph values or fields of `PreparedMedia`.

`PreparedPictureSampling` is the shared terminal relation between one decodable
`PreparedSignalPictureSource` and an existing `TemporalMap`. The Map's target is the consumer's local signal domain and its
terminal source is the stream presentation domain. `PreparedMedia` can project this relation through
`preparedPictureSampling()`, while a transient renderer may publish the same relation for execution-owned bytes. The latter
does not acquire a Media Asset identity: the shared type unifies sampling facts, not lifecycle or ownership.

## Terminal delivery

`PictureObservation` is the inspection vocabulary for source pixel meaning. It can preserve tags that the
current execution path does not implement so Preparation can reject them accurately. A complete
`PictureInterpretation` is deliberately narrower: it admits only the two SDR signal families implemented
by current preparation and rendering. Composition and Program do not carry a selectable or extensible-looking
working-picture record. `OutputPictureSpec`
describes a delivery picture: encoded video uses `VideoOutputPictureSpec`, while PNG frame capture uses
`FrameOutputPictureSpec`. Final video delivery is opaque and owns its matte; frame capture may either apply that explicit
opaque matte or preserve straight alpha for a transient Picture Product. `MediaDeliverySpec` is the author-owned requirement for one finished file. It declares the picture
profile and matte policy, coded video target, audio target and container once. The pure
`project-visual-delivery` Producer derives the `VisualDeliverySpec` needed by a visual renderer;
the complete value independently reaches final mux.

`RenderedVisual` records the exact visual requirement implemented by its encoded Artifact.
`RenderedAudio` records its canonical PCM Artifact and actual sample count; its type already means 48 kHz stereo PCM.
`MuxedMedia` records
the complete delivery requirement. Final mux rejects inputs prepared for a different requirement;
it does not silently transcode them or recover policy from a Provider configuration.

These values do not contain encoder names, hardware choices, browser selection, texture handles,
worker counts or cache budgets. Such facts belong to the selected Provider and Runtime Profile.
The current delivery contract is deliberately one complete family: opaque BT.709 limited-range 8-bit
H.264/yuv420p visual, 48 kHz stereo AAC audio and MP4. The author selects quality and opaque matte:

```svml
module media from "@hypit/media-author"

media.delivery { id: delivery profile: bt709-h264 quality: high matte: "#000000" }
```

The declaration does not select Chromium, Electron, an encoder or a display mode. Runtime binding selects
an Endpoint that implements the same complete request.

## Font files

`Font` takes an explicit source path and the selected face's real weight and style:

```svml
media.font { id: caption-font src: "./assets/fonts/creator-bold.otf" weight: 700 style: normal }
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
media.font { id: latin src: "package:@company/type/files/latin.woff2" weight: 600 style: normal }
media.font {
  id: han weight: 600 style: normal
  Source { src: "./assets/fonts/han-1.woff2" unicode-range: "U+4E00-9FFF" }
}
media.font-stack {
  id: caption primary: @latin
  Fallback { font: @han }
}
```
