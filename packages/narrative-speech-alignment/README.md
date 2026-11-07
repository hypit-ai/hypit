# `@hypit/narrative-speech-alignment`

Deterministic M:N alignment between one authored Narrative Segment and one final `TimedTranscript` on
an exact local temporal domain. It does not call a speech model, read audio, infer speakers or retain
recognizer internals.

The bounded monotonic matcher accepts exact, split, merge, replacement, source-omission and
evidence-insertion groups. Timed word windows locate authored tokens; token-length interpolation is
used inside merged windows and across genuinely unmeasured runs. The public `NarrativeAlignment`
remains exact local time and contains every authored token.

`correctTimedTranscript` applies the same M:N relation in the other useful direction: detected wording
is replaced by authored wording while the result stays the same `TimedTranscript` JSON shape. This is
the correction used before attaching a transcript to media; it does not create a second evidence type
or active/preferred registry.

The package exposes syntax-neutral functions and a deterministic Producer. It has no SVML/Markup
declaration, Media, Provider, Runtime, queue or credential authority. Caption display and NLE
materialization remain downstream concerns.
