# `@hypit/audio-program`

Renderer-facing audio Programme for an `AudioComposition` on one `Timeline`.

The package namespaces every selected closed `AudioSignalGraph`, joins their outputs with one root
Mix, and preserves source, mix, process, explicit port and shared-upstream topology in an exact
48 kHz programme. It declares the `render-timeline-audio` capability. Each occurrence retains its selected audio source,
complete Prepared Media map, complete occurrence map, exact absolute target range and mix automation.
Only absolute programme and mix boundaries are projected onto the 48 kHz grid here.

`AudioProgram` is one closed signal graph. Source, Mix and package-owned Process nodes are its
complete execution topology.

It does not turn a relation into `trim`, `loop` or `playbackRate` modes. A selected Renderer privately
lowers the preserved graph and maps according to its signal capability and reports unsupported Process
formats or map shapes through its request-local Endpoint support decision. This package does not choose that Provider, own media
bytes, author Audio Tracks, reconstruct the origin of a map, or mux the rendered signal into a
delivery container.
