# `@hypit/speech`

External components use `@hypit/hypit/speech` from their `@hypit/hypit` development dependency. The package
owns the types and helpers below; Source imports retain the `@hypit/speech@1` Module identity.


Public contracts for speech duration, normalized semantic Takes and provider-neutral evidence audio.
A `SemanticTake` contains one normalized media product, one authored Segment, its words and local
frame anchors. Ordered Takes are assembled by `@hypit/speech-track` into a `SemanticTrack`, which is
the program's continuous semantic skeleton. `SpeechEvidenceAudio` carries canonical 16 kHz WAV bytes
and their exact sample count; it never carries Script or Segment identity.

The package also owns deterministic boundary materialization for a Segment with no Tokens. It maps
the Segment start and end to the prepared media's frame domain and publishes the same
`SemanticTake` type. The preview and real-media author surfaces both select this operation for an
empty Segment. There are no word windows to predict or acoustic evidence to request.
