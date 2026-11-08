# `@hypit/narrative-caption`

The explicit adapter between rendering-neutral Caption content and source-local Narrative timing.

`NarrativeCaptionBinding` relates every Caption Unit to one or more Narrative Token identities.
`projectNarrativeCaptionTiming()` combines that Binding with a `CaptionDocument` and
`NarrativeLocalTiming`, producing `LocalCaptionTiming` in the same exact domain.
`captionUnitsForNarrativeSelection()` projects an authored Selection—or a Segment's two authored
anchors supplied as one Selection value—to complete Caption Units. Project programs should use that
query instead of reimplementing Token-to-Unit traversal.

The adapter knows no Timeline, NLE Track, frame rate, Style, renderer or speech matcher. It
registers no AuthorGraph Producer, Markup declaration or Hypit activation; a project program uses
the returned value transiently before materializing ordinary NLE data.
