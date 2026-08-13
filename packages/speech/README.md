# `@narratage/speech`

Public contracts for speech duration, assembled bases and alignment audio projections. SpeechBasis
Segments use exact ProgramSpace frame boundaries. The separate SpeechEvidenceAudio contract carries
canonical 16 kHz WAV bytes and their exact sample count; neither contract duplicates floating-point
Segment seconds.
