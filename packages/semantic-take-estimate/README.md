# `@hypit/semantic-take-estimate`

An explicit, provider-free alternative to measured speech alignment for preview Builds.

```text
Narrative + Segment + normalized SynchronizedMedia + SpeechEstimatePolicy
  -> syllable-weighted Token windows with real gaps
  -> SemanticTake
```

The package consumes an existing normalized media value. It knows nothing about how the video was
generated and does not run FFmpeg, OpenCV, WhisperX or any other external process. It preserves the
Script's exact Segment, Token and Anchor identities and estimates only their local frame positions.
The normalized media's complete frame count is the allocation budget: after short edge and word
gaps, every remaining frame is distributed across Tokens by pronunciation-unit weight. A longer
normalized video therefore stretches the whole Script across that longer interval instead of
leaving a fixed-length estimate at the beginning.

```svml
<estimated:SemanticTake id="opening-estimated" narrative={story}
  segment={story.segment.opening} media={opening-media.media}
  language="en" pace="normal" min="4" max="15" rounding="round"/>
```

The delivery policy is the element's own: write it inline as above, or name an SVS Recipe with
`policy={recipes.speech.normal}` carrying the same properties. Nothing else in the graph computes
it; durations themselves are author literals, measured beforehand with `hypit measure`.

The result has the ordinary `@hypit/speech@1#SemanticTake` type. A Run can therefore choose this
Build output while real A-roll is unavailable, then later choose the corresponding WhisperX output
without changing Speech Track, Caption, Selection or Studio protocols.

For example, a later Studio Run may satisfy its ordinary measured-take output with the earlier
estimated Build product:

```svrun
<build-record id="opening-preview" build="bld_..." output="opening-estimated.take"/>
<satisfy output="opening-semantic.take" candidate="opening-preview"/>
```

This is ordinary Run candidate selection. There is no preview-specific `SemanticTake` subtype and
Studio still opens only after every required output has an actual candidate with no unresolved Need.
