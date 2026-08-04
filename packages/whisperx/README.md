# @svml/whisperx

Explicit WhisperX model-family capability for the official speech program. Importing this package
selects WhisperX; Runtime registration only binds the resulting `WhisperXAlignmentEvidence` Need to
a concrete WhisperX execution endpoint such as a trusted local worker or Hypit.

The package contains no credentials, Python environment or queue. Providers translate the typed
request constraints and return the canonical WhisperX result contract. A deterministic Producer
then lowers that result to provider-neutral `AlignedTranscriptEvidence`.

The request Producer consumes only `SpeechAudioBasis`, never the visual SpeechTake projection.
Producer result affinity requires returned Basis, audio Artifact and ProgramSpace digests to match
that exact input before the Evidence can enter BuildState.
