# `@hypit/media-execution`

Shared FFmpeg execution body for Hypit media Providers.

Timeline-audio requests accept an optional `range: { startFrame, endFrameExclusive }` on the
original programme clock. Only overlapping clips are read. Loop phase, tempo, gain and fades
are evaluated in their original clip coordinates before trimming and rebasing the selected mix.
The output remains 48 kHz stereo PCM. At rational frame rates, its sample count is rounded from
the selected frame count; reconciling that zero-based clock can trim or pad one boundary sample.

`@hypit/media-pipeline` owns provider-neutral Needs, plans and result contracts. This package
owns the byte-level implementations of the eight current operations:

- inspect every media stream;
- normalize selected audio/video streams;
- transform synchronized media with ordered trim and pitch-preserving retime operations;
- extract one selected audio stream as an ordinary 48 kHz stereo WAV Artifact;
- extract a first, last, indexed or time-selected frame as PNG;
- project canonical 16 kHz mono speech-evidence audio;
- render an exact sample-domain audio program;
- mux rendered visual and audio products.

Local and AWS Lambda Providers call these same functions with different Artifact I/O and FFmpeg
launch environments. They therefore share stream selection, timing, codec and validation behavior
instead of reimplementing media semantics per deployment.

This is not an author package, Provider, queue or Core extension. It performs no endpoint selection,
credential lookup or SVML parsing.
