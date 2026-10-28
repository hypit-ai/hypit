# `@hypit/audio-program`

Renderer-facing audio Programme for a closed `Composition` on one `Timeline`.

The package lowers the source-neutral `AudioSignalGraph` into an exact 48 kHz programme and
declares the `render-timeline-audio` capability. Each occurrence retains its selected audio source,
complete Prepared Media map, complete occurrence map, exact absolute target range and mix automation.
Only absolute programme and mix boundaries are projected onto the 48 kHz grid here.

It does not turn a relation into `trim`, `loop` or `playbackRate` modes. A selected Renderer privately
lowers the preserved map according to its signal capability and reports unsupported map shapes through
its request-local Endpoint support decision. This package does not choose that Provider, own media
bytes, author Audio Tracks, reconstruct the origin of a map, or mux the rendered signal into a
delivery container.
