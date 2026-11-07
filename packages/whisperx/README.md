# `@hypit/whisperx`

WhisperX model-family capability and its `hypit transcribe` authoring command. Runtime registration
binds the request to a concrete hosted or local Endpoint; this package contains no credentials,
Python environment or queue.

The command projects an audio or video file to invocation-local `SpeechEvidenceAudio`, calls the
selected Endpoint, and writes one editable `@hypit/timed-transcript@1#TimedTranscript` JSON file:

```bash
hypit transcribe reference.mp4 --language en --to notes/reference.transcript.json
```

WhisperX native output is transient. The adapter retains language, segments, words and their second
boundaries, while removing scores, model identity and other recognizer details. The same file shape is
used whether detected wording is accepted directly or later corrected through deterministic M:N
alignment. No Author Graph, Build, Result or SVML declaration is created.

For Chinese speech use `zh`. Language spelling is explicit; the selected Endpoint owns actual model
support. `@hypit/timed-transcript` owns the document codec and Media Representation. WhisperX owns only
how that document is measured with this model family.

## Local deployment

`@hypit/provider-hypihub` is the normal hosted adapter. A local deployment may bind the same Need:

```json
{
  "endpoints": {
    "whisperx.local": {
      "use": "@hypit/provider-whisperx-local",
      "config": { "expectedModel": "small" }
    }
  },
  "bindings": {
    "@hypit/whisperx@1#whisperx-transcription": "whisperx.local"
  }
}
```

The Provider README owns model cache and hardware choices.
