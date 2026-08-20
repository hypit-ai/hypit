# @hypit/speech-spine

Trusted, static Graph Fragments for the first official speech-video Program.

This package contains no Core behavior, Provider credentials, queues, or API
clients. It only composes ordinary Producers from the leaf packages into
auditable reusable graph contributions:

- atomic SpeechBasis audio/visual projections after assembly;
- already-semantic Take assembly plus the provider-neutral speech SemanticMap;
- timed caption projection.

The package also owns `<speech:Spine>`. The Spine consumes the shared program `Clock` (with a
legacy inline `frame-rate` accepted during migration) and its restricted visual base
(`visual-frame`, `visual-appearance`, `visual-z`); each
`<speech:Take>` connects one self-contained `SemanticTake`. Media normalization, acoustic evidence,
and local semantic projection happen before the Spine is entered.

Visual Takes may override the Spine base with `frame`, `appearance` and `z`. That is the complete
visual authority of Speech Spine: one same-source visual clip may be placed and stacked. Motion,
transitions, sequences and independent pictures remain ordinary Media Tracks.

The Surface then expands an immutable append fold, one timeline-audio render and ordinary
SpeechBasis projections. Whitespace and child layout do not create ports, and Core receives no
variadic node, media-normalization rule, provider call, or global alignment special case.

The Elaborator expands them hygienically before SVML Core sees the graph.
