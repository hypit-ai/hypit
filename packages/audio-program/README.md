# `@hypit/audio-program`

Renderer-facing continuous audio Programme on one exact local temporal Domain.

The Programme preserves source, nested Programme, restrict, mix, process and shared-upstream topology. It chooses an
explicit terminal sample rate independently of any video frame rate. Every Programme node has one signal output,
so internal references name only the node instead of repeating a literal port.
It declares the `render-audio` capability. A media source leaf contains only the selected
`PreparedAudioSource` and its Prepared-local-to-source relation. Placement and occurrence sampling exist only on a
parent nested Programme use. Process automation exists only as package-owned Process programmes and complete
Programme-to-Control Maps. Target sample spans and total sample count remain projections of exact ranges and the
Programme Domain instead of duplicate video-frame fields.

`AudioProgram` is one closed signal graph. Source, nested Programme, Restrict, Mix and package-owned Process
nodes are its complete execution topology. A nested Programme node applies one exact target-local-to-child-local
`TemporalMap`; it may also carry the package-owned reconstruction policy for that particular mapped read. It keeps
the child signal closed instead of rendering it to a temporary Media identity. Media is
therefore a leaf source, not the universal representation of every signal. Process ports are freely named by
their programme format. Process nodes also carry complete Programme-to-Control temporal Maps; value meaning
and interpolation remain owned by the package that owns the process programme. A concrete Renderer may
support a narrower subset and must reject unsupported ports or programmes at its capability boundary. Process
nodes additionally preserve the AVIR Operator's per-input before/after support, state/pre-roll, latency and tail;
the current local media engine executes only pointwise Gain and rejects non-pointwise contracts accurately.

The local renderer traverses nested Programme nodes recursively, discovers only the media leaves demanded by
the selected output range, and evaluates each child through its explicit map. Nested programmes must use the
same selected terminal sample rate; this is a renderer-facing signal constraint, not an authored Clock.

It does not turn a relation into `trim`, `loop` or `playbackRate` modes. A selected Renderer privately
lowers the preserved graph and maps according to its signal capability and reports unsupported Process
formats or map shapes at its capability boundary. This package does not choose that Renderer, own media
bytes, author Audio Tracks, reconstruct the origin of a map, or mux the rendered signal into a
delivery container.

Typed upstream lowering supplies an `AudioProgram` directly. Media identity remains a leaf input; placement,
sampling, gain, fade, envelope and reconstruction are expressed by the programme graph and its package-owned
process programmes.
