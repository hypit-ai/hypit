# `@hypit/narrative-speech-alignment`

Deterministic M:N alignment between one authored Narrative Segment and one final `TimedTranscript`
in an exact local temporal domain.

The bounded monotonic matcher accepts exact, split, merge, replacement, source-omission and
evidence-insertion groups. `alignNarrative()` locates every authored Token;
`correctTimedTranscript()` applies the same relation in the other direction while retaining the
ordinary editable transcript JSON shape.
When the Narrative came from Script, pass `scriptSegmentSpeech()` as `segmentText` so the compatible
transcript keeps the authored punctuation and language spacing in its human-readable Segment text;
Word timing and matching remain syntax-neutral.

The package calls no model and owns no Media, Provider, Runtime, queue, AuthorGraph Producer,
Markup declaration or activation. Caption display and NLE materialization remain downstream.
