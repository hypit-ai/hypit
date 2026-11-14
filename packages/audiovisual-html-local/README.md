# `@hypit/audiovisual-html-local`

Local alpha-preserving materializer for HTML Picture Operator islands.

`createLocalHtmlPictureProductPublisher()` implements the Host-owned publishing seam of
`@hypit/audiovisual-html`. It captures the exact island `HtmlProgram` as straight-alpha PNG frames,
encodes those frames as a VP9-alpha WebM using the encoder's lossless mode and returns a transient Media
`PreparedPictureSampling`. The downstream Terminal consumes that typed sampling relation; neither
AVIR nor the NLE names Chromium, FFmpeg, PNG, WebM or a filesystem path.

The PNGs and WebM are `DerivedRenderProduct` execution values. They are not `PreparedMedia`, Media
Assets, NLE items or durable Results. Their `ResourceStore` lifetime belongs to the calling Host.
The package performs no automatic Terminal selection: the Host must explicitly bind an Operator
island to an HTML capability created with `publishesPictureProducts: true`, install this publisher
on the matching executor and bind its Product representation to
`prepared-picture-sampling`.

`createLocalHtmlOperatorTerminalRuntime()` closes that publisher together with the exact HTML
capability offer and executor. It is the normal local Host entry point for an Operator island; the
lower-level publisher remains available to Hosts that already assemble runtime pairs themselves.

This first implementation evaluates the complete demanded bounding range and carries transparency
through Chromium and libvpx-vp9. VP9 alpha uses a 4:2:0 carrier, so the encoder's lossless mode does
not claim RGB-domain identity across its colour conversion. It does not claim checkpoint/resume or sparse frame-sequence
transport. Final opaque H.264 delivery remains a separate root-Terminal concern.
