# `@hypit/still-video`

Exact materialization of one or more still-image Blobs as a video-only Blob. Planning is pure: a
literal `TemporalDuration`, a consumer-selected `TemporalSamplingGrid`, and relative picture weights
must resolve to a positive whole frame count. Pictures then bind in authored order; only rendering is
a Provider Need.

This is physical preprocessing for consumers that require video bytes. It is not an NLE occurrence,
a global timeline clock, or an inference from an AIGC duration request.
