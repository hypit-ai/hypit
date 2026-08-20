# `@hypit/speech`

Public contracts for speech duration, normalized semantic Takes and provider-neutral evidence audio.
A `SemanticTake` contains one normalized media product, one authored Segment, its words and local
frame anchors. Ordered Takes are assembled by `@hypit/speech-track` into a `SemanticTrack`, which is
the program's continuous semantic skeleton. `SpeechEvidenceAudio` carries canonical 16 kHz WAV bytes
and their exact sample count; it never carries Script or Segment identity.
