# @narratage/speech-spine

Trusted, static Graph Fragments for the first official speech-video Program.

This package contains no Core behavior, Provider credentials, queues, or API
clients. It only composes ordinary Producers from the leaf packages into
auditable reusable graph contributions:

- atomic SpeechBasis audio/visual projections;
- WhisperX evidence plus the provider-neutral speech SemanticMap;
- timed caption projection.

The package also owns `<speech:Spine>`. The Spine explicitly declares its `frame-rate`; each
`<speech:Take>` connects one `NarrativeExcerpt` and exactly one of:

- `video={...}` — an ordinary generated video Blob. The Surface expands inspection, stream
  selection and A/V normalization before assembly;
- `media={...}` — an already prepared `SynchronizedMedia` value, connected directly.

The Surface then expands an immutable append fold, one timeline-audio render and ordinary
SpeechBasis projections. Whitespace and child layout do not create ports, and Core receives no
variadic node, media-normalization rule or Speech special case.

The Elaborator expands them hygienically before SVML Core sees the graph.
