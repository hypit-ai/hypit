# `@hypit/render-hyperframes`

Explicit author and capability boundary for final HyperFrames video rendering.

The package owns `<render:Video composition={...}/>` and lowers it to six ordinary Operations:

1. compile the referenced `Composition` into a `HyperframesDocument`;
2. request a silent, frame-exact `RenderedVisual`;
3. compile every peer `AudioTrack` into one `AudioProgramPlan`;
4. request an exact 48 kHz `TimelineAudio`;
5. request one `MuxedMedia` from those two independently verified Products;
6. expose the verified mux Artifact unchanged as a domain-neutral `BlobArtifact`.

The package is not a renderer and contains no queue, credentials or deployment choice. A local
HyperFrames process, a hosted endpoint or another conforming execution package may register a
Provider for the exact visual capability. Media Providers independently realize audio rendering and
mux. None parses SVML or decides which Composition to render. Every result is bound to the same
ProgramSpace and exact frame/sample domain before it can become a final video Record.

The output does not carry copied duration or lineage metadata. It is an ordinary Resource-backed
Blob and can therefore be connected directly to any later component that accepts Blob bytes. A
consumer that needs stream or duration facts must request explicit media inspection.

Core therefore sees three real byte-operation Needs, not one opaque mega-render. Frame workers,
contiguous or interleaved chunks, retries and image-sequence assembly remain inside the selected
visual Endpoint; clip decoding/mixing remains inside the audio Endpoint; container encoding remains
inside the mux Endpoint. A single Provider package may implement all three locally, or a Runtime may
bind them to separate Lambda-backed Endpoints. The author still sees one `<render:Video>` result.

Film is not a dependency of this author meaning. Any package that produces the common Composition
contract can feed the render Surface. Conversely, targeting Composition never demands this package;
rendering exists only when the author declares and the Build targets the video output.

`@hypit/provider-hyperframes-local` is the first concrete visual implementation. It stages the
document's exact `BlobRef` dependencies, lets HyperFrames partition the finite frame domain across
configured Chrome workers, emits a silent MP4 and rejects output unless ffprobe proves one H.264
stream with the declared canvas, rational frame rate and frame count.
