# @hypit/speech-track

Trusted, static Graph Fragments for the first official speech-video Program.

This package contains no Core behavior, Provider credentials, queues, or API
clients. It only composes ordinary Producers from the leaf packages into
auditable reusable graph contributions:

- ordered, already-semantic Take assembly into one `SemanticTrack`;
- aligned peer VisualTrack and AudioTrack projections.

The package also owns `<speech:Track>`. The Track consumes a restricted visual base
(`visual-frame`, `visual-appearance`, `visual-z`); each
`<speech:Take>` connects one self-contained `SemanticTake`. Media normalization, acoustic evidence,
and local semantic projection happen before the Track is entered.

The shared frame rate and total ProgramSpace are derived from the ordered SemanticTakes. The Track
does not accept a second Clock or frame-rate declaration.

Visual Takes may override the Track base with `frame`, `appearance` and `z`. That is the complete
visual authority of Speech Track: one same-source visual clip may be placed and stacked. Motion,
transitions, sequences and independent pictures remain ordinary Media Tracks.

The Surface then expands an immutable append fold and ordinary SemanticTrack, VisualTrack and
AudioTrack projections. Whitespace and child layout do not create ports, and Core receives no
variadic node, media-normalization rule, provider call, or global alignment special case.

The Elaborator expands them hygienically before SVML Core sees the graph.
