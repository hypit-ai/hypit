# `@svml/hyperframes-render`

Explicit author and capability boundary for final HyperFrames video rendering.

The package owns `<render:Video composition={...}/>` and lowers it to three ordinary Operations:

1. compile the referenced `Composition` into a content-addressed `HyperframesDocument`;
2. request the exact `@svml/hyperframes-render#render-video` capability;
3. project the fulfilled render Product into the shared `MediaArtifactRef` contract.

The package is not a renderer and contains no queue, credentials or deployment choice. A local
HyperFrames process, a hosted Hypit endpoint or another conforming execution package may register a
Provider for the exact capability. That Provider receives an already compiled document and returns
a Product bound to its digest, ProgramSpace, rational frame rate, frame count and canvas. It does not
parse SVML or decide which Composition to render. A Product that claims another frame domain is
rejected by Producer affinity before it can become a final video Record.

Core sees one render Need. Frame workers, contiguous or interleaved chunks, retries, image-sequence
assembly and the final one-time audio mux remain inside the selected Endpoint. This preserves one
author-visible result while allowing a local HyperFrames process or a distributed Lambda adapter to
render every frame in parallel according to deployment policy.

Film is not a dependency of this author meaning. Any package that produces the common Composition
contract can feed the render Surface. Conversely, targeting Composition never demands this package;
rendering exists only when the author declares and the Build targets the video output.
