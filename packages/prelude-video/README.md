# `@svml/prelude-video`

Ordinary multi-facet package aggregate for the official video language. It contributes Module
Manifests, the SVS Frontend, official Text Surfaces and the deterministic compute facets currently
owned by those modules. Compiler and Runtime Hosts grant those facets independently. The package
has no Provider, credential, store, queue, network or rendering authority.

The aggregate now carries the complete `@svml/speech-take`, `@svml/speech-align` and
`@svml/caption` Manifests, including four Product projections, the provider-neutral timing locator,
Caption temporalization, VisualTrack lowering and Caption-owned validators. A physical package-lock
test proves that these dependencies are discovered from the installed package closure rather than
from a CLI or Runtime registration list.

The CLI depends only on this replaceable prelude rather than enumerating Script, Film or
HyperFrames packages itself.
