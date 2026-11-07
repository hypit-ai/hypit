# `@hypit/media-delivery`

Terminal audiovisual delivery assembly.

The package checks that one `RenderedVisual` and one `RenderedAudio` implement the same explicit
`MediaDeliverySpec`, requests muxing through a replaceable capability, and projects the resulting
`MuxedMedia` to its video Blob. It does not author a Film, compile either Programme, choose a
Provider, or own container bytes.

`createMuxMediaNeed` is the shared pure request boundary used by both the Producer and direct delivery callers. It
checks visual delivery identity and exact frame-to-audio duration before any mux Provider runs.
`verifyMuxedMediaForNeed` then checks that the returned MP4 implements that exact request.
