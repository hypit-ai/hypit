# `@hypit/caption-basic`

The official Basic Caption family for ordinary NLE projects.

It schedules role and Cue presentation, materializes complete `CaptionCuePayload` values into ordinary
NLE Component Items, and renders those Items through the HTML video terminal. Karaoke is a
presentation choice over the timing already stored inside each Item. The neutral payload and its
lightweight word and Unit-time edits remain owned by `@hypit/caption`, so another family never needs
to depend on Basic.

The package consumes `CaptionDocument` and `LocalCaptionTiming` from `@hypit/caption`. It owns no
Script, Narrative, transcript, alignment, media lookup or named timing dependency.
