# `@hypit/speech-evidence`

Invocation-local canonical audio for speech analyzers.

`SpeechEvidenceAudio` contains one 16 kHz mono PCM WAV Resource and its exact sample count. The
`project-speech-evidence-audio` Capability projects the explicitly selected audio presentation of a
`PreparedMedia` value into that model input. This value is transport for one analysis request; it is
not the editable transcript attached to media.

The package deliberately owns no transcript document, recognizer score, Provider identity, semantic
Segment or Media Representation. Final aligned speech files belong to `@hypit/timed-transcript`.
WhisperX and other analyzers may share this audio input without sharing a result implementation.
