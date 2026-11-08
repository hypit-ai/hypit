# `@hypit/caption`

Rendering-neutral Caption content and source-local timing.

- `CaptionDocument` owns display Words, indivisible display-to-speech Units, authored Cues and
  optional Role labels. It contains no media, time, rectangle, Style or NLE identity.
- `CaptionDisplayWord.attributes` preserves family-owned word roles such as `face=serif`; this
  package validates their flat shape but assigns no rendering meaning.
- `LocalCaptionTiming` relates Unit identities to exact regions in one local temporal domain.
- `CaptionSelection` chooses all content, named Cues or named Units for an explicit consumer.
- `captionUnitText`, `captionCueText`, `captionSelectionForRole` and
  `captionWordIdsForAttribute` query those authored facts without reconstructing language spacing or
  component semantics in project scripts.
- `CaptionCuePayload` is the complete, directly editable Words and Unit-local time owned by one
  materialized Cue block. Its small edit helpers change display spelling or one Unit boundary.

The package does not know whether timing came from speech alignment, SRT/WebVTT, direct authoring or
another adapter. It also does not activate a Hypit module or depend on Audiovisual, HTML, NLE,
Runtime, Provider or SVML.

`@hypit/caption-basic` is one concrete NLE Caption family. It owns presentation rules, materialized
Cue payloads, Karaoke behavior and HTML rendering without changing this neutral document model.
