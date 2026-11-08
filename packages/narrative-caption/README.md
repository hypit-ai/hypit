# `@hypit/narrative-caption`

The explicit adapter between rendering-neutral Caption content and source-local Narrative timing.

`NarrativeCaptionBinding` relates every Caption Unit to one or more Narrative Token identities.
`projectNarrativeCaptionTiming()` combines that Binding with a `CaptionDocument` and
`NarrativeLocalTiming`, producing `LocalCaptionTiming` in the same exact domain.

The adapter knows no Timeline, NLE Track, frame rate, Style, renderer or speech matcher. It
registers no AuthorGraph Producer, Markup declaration or Hypit activation; a project program uses
the returned value transiently before materializing ordinary NLE data.
