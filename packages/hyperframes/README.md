# @narratage/hyperframes

Deterministic reference lowering from the generic `Composition` contract to a portable
`HyperframesDocument`.

This package implements the one closed `narratage.visual-ir@1` target declared by every
VisualTrack. The vocabulary is owned by `@narratage/visual-ir`; Track and Composition values are
owned by `@narratage/composition`. Neither is an author component
and not arbitrary CSS. Unknown properties and alternate browser semantics fail before document
compilation; visuals outside the structural vocabulary enter as typed `CompositableSurface` values.

This package understands only `VisualTrack`, `ProgramSpace` and canvas geometry. It
does not know Caption, Speech, B-roll, Seedance or any other author-domain component. It flattens
every Track's Presents, orders them by their own absolute stacking keys and emits frame-bound local
keyframes. An authoring Track never becomes an isolated render stacking surface.

It deliberately ignores `AudioTrack`. HyperFrames produces a silent visual fact; the media pipeline
compiles and renders program audio separately, then an explicit mux Provider joins the two. Changing
audio can therefore never be implemented by secretly changing HyperFrames HTML or its renderer.

Media remains content addressed in the compiled HTML as `narratage-artifact://` placeholders. The
document separately carries each dependency's complete `BlobRef` (digest, byte count and MIME), so
a Provider can verify and name staged bytes without guessing from the hash. A local or hosted
render Runtime calls `materializeHyperframesHtml()` with its own Artifact URL resolver before
handing the HTML to HyperFrames. That environment-specific materialization is not a new compiled
Record and does not change the document digest.

The document exposes its render domain directly rather than asking an Endpoint to scrape HTML:
exact rational `frameRate`, integer `frameCount`, and canvas dimensions are explicit document
content. The ProgramSpace relationship is an input edge of the Producer and is not copied into the
document as lineage metadata. Legal frame addresses are exactly `[0, frameCount)`. A local worker pool or a
hosted renderer may independently evaluate any legal frame or half-open chunk; partition size and
worker count are Runtime policy, not author intent and not Core graph nodes. The emitted root also
uses the rational HyperFrames `data-fps` form, so NTSC rates do not drift through a decimal guess.

Exact `FontArtifactRef` dependencies lower to generated `@font-face` declarations with font
synthesis disabled; a Unicode-range-sharded logical face emits one rule per exact source. Terminal
text without a non-empty exact Font stack is invalid rather than falling back to machine fonts.
`CompositableSurfaceRef` values lower as typed image/video surfaces carrying
their declared alpha, color-space and frame-domain metadata. The package never guesses either fact
from a user font name or filename extension. The document carries a deduplicated typed Surface set
beside its Artifact set so a staging Runtime can verify the exact bytes before rendering.

The ordinary test suite validates deterministic HTML and Artifact collection. Set
`NARRATAGE_BROWSER_TESTS=1` to run the host integration witness that invokes the installed Hyperframes
CLI, paints a real font and checks straight-alpha composition at the rendered pixel level. That
test needs Chrome and FFmpeg; its multilingual case uses only the locked open-font package, not a
system font. It is a renderer conformance witness, not Core logic.
`@narratage/provider-hyperframes-local` adds a real two-worker silent-MP4 witness and strict ffprobe
output verification.
