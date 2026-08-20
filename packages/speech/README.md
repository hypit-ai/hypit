# `@hypit/speech`

Public contracts for speech duration, normalized semantic Takes, assembled speech bases and provider-
neutral evidence audio. A `SemanticTake` contains one normalized media product, one authored Segment,
its words and local frame anchors. `SpeechBasis` is only the assembled post-Spine product used to
project final peer VisualTrack and AudioTrack values. `SpeechEvidenceAudio` carries canonical 16 kHz
WAV bytes and their exact sample count; it never carries Script or Segment identity.
