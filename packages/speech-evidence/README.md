# `@hypit/speech-evidence`

Invocation-local canonical audio for speech analyzers.

`SpeechEvidenceAudio` contains one 16 kHz mono PCM WAV Resource and its exact sample count. The
`project-speech-evidence-audio` Capability projects the explicitly selected audio presentation of a
`PreparedMedia` value into that model input. This value is transport for one analysis request; it is
not the editable transcript attached to media.

The package deliberately owns no transcript document, recognizer score, Provider identity, semantic
Segment or Media Representation. Final aligned speech files belong to `@hypit/timed-transcript`.
WhisperX and other analyzers may share this audio input without sharing a result implementation.

The package contributes `@hypit/speech-evidence#project-audio` as a Generation Graph operation.
It accepts `PreparedMedia` and publishes invocation-local `SpeechEvidenceAudio`; analyzers such as
WhisperX consume that typed output in the next node. Generation Graph Core does not know that this is
audio preparation, and Provider packages remain responsible only for satisfying the Capability.
