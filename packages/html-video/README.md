# @hypit/html-video

Final delivery adapter for an already lowered `HtmlProgram`, `AudioProgram` and
explicit `MediaDeliverySpec`.

`createHtmlVideoDeliveryPlan()` projects one delivery policy into exact visual
and audio render requests. An optional absolute `FrameSpan` selects the matching
half-open interval from both programmes. An upstream-focused Picture Programme can
instead be paired with the corresponding absolute Audio range; the plan verifies
their selected sample durations before execution. Omitting either form delivers the whole programme.
`executeHtmlVideoDeliveryPlan()` executes both
requests in parallel through an injected executor and creates the mux request
only after their typed products exist. This package contains no Chromium,
FFmpeg, filesystem, Endpoint or Runtime policy.

`lowerNleProjectToHtmlVideoDeliveryPlan()` is a convenience composition over
`@hypit/nle-audiovisual`: it links one NLE snapshot once, derives both terminal
programmes from the same AVIR value, and supplies exact silence for a
picture-only project. NLE linking, package facets, multi-Terminal execution and
output sampling belong to `@hypit/nle-audiovisual`, not to this delivery
package.

The optional Author Graph fragment remains in `@hypit/html-video-author`.
Concrete rasterization, audio rendering and muxing remain with the caller's
selected execution implementations.
