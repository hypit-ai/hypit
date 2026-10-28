# `@hypit/media-delivery`

Terminal audiovisual delivery assembly.

The package checks that one `TimelineVisual` and one `TimelineAudio` implement the same explicit
`MediaDeliverySpec`, requests muxing through a replaceable capability, and projects the resulting
`MuxedMedia` to its video Blob. It does not author a Film, compile either Programme, choose a
Provider, or own container bytes.
