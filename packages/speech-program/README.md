# @narratage/speech-program

Trusted, static Graph Fragments for the first official speech-video Program.

This package contains no Core behavior, Provider credentials, queues, or API
clients. It only composes ordinary Producers from the leaf packages into
auditable reusable graph contributions:

- atomic SpeechTake audio/visual projections;
- WhisperX evidence plus the provider-neutral speech SemanticMap;
- timed caption projection.

The package also owns `<speech:Spine>`. Each `<speech:Take>` explicitly connects a generated Blob
and its `NarrativeExcerpt`; the Surface expands per-Take media normalization, an immutable append
fold, one timeline-audio render and ordinary SpeechBasis projections. Whitespace and child layout
do not create ports, and Core receives no variadic node or Speech special case.

The Elaborator expands them hygienically before SVML Core sees the graph.
