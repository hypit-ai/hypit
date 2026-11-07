# `@hypit/speech-evidence`

Provider-neutral acoustic and word-alignment observations. Evidence is not the authored semantic truth.

The package also owns the exact Media Representation type
`@hypit/speech-evidence@1#SpeechTranscriptEvidence`. A file-backed instance must be attached through
both temporal and audio bindings. Opening it decodes the ordinary JSON document and checks
that its exact 16 kHz sample span equals the Representation-local temporal domain. Media Asset Core does
not decode the document or know whether WhisperX, another detector or an imported file produced it.

External package authors import these contracts from `@hypit/speech-evidence`; their logical
Module identity remains `@hypit/speech-evidence@1`.

`SpeechEvidenceAudio` carries canonical 16 kHz mono WAV bytes and their exact sample count.
`SpeechTranscriptEvidence` preserves that sample span while adding measured passages, words,
characters and speech activity. These are source-clock observations: they do not claim a semantic
Segment, a local frame domain or a Timeline position.

The package also owns the provider-neutral `project-speech-evidence-audio` Capability and its
deterministic request Producer. That Producer requests the exact 16 kHz mono projection of one
`PreparedMedia` value, including its explicit audio time map. A media Provider may implement the bytes, but media operations do not own
the acoustic-evidence contract.

## Transcript evidence document

The lossless file form of `SpeechTranscriptEvidence` is the exact JSON value:

```json
{
  "sampleFrames": 32000,
  "passages": []
}
```

`hypit transcribe` writes this JSON directly. The package owns its exact codec and word/phrase inspection
views because those operations concern speech evidence, not FFmpeg and not a Timeline. A local-media
inspection tool may project sample coordinates to seconds to select frames, but it does not acquire
ownership of transcript meaning.

`wordsAt` uses half-open word spans and preserves overlaps. `phraseRanges` matches whole consecutive
words, preserves repeated occurrences and returns each measured range; it never guesses which
occurrence an author intended. Missing word times remain missing rather than being inferred as
silence. These values stay on the transcript input's local clock until an explicit alignment
operation combines the evidence with a local temporal domain and authored Narrative.
