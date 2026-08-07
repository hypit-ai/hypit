# `@narratage/gemini-omni`

Exact author/compute contract for Gemini Omni video generation.

It defines one `video` endpoint with duration, aspect ratio, resolution and bounded image, opaque
audio, video-range and character references. It validates and seals requests, then emits the
provider-neutral `GeneratedVideoSet` contract from `@narratage/generation`.

The package does not call an API. `@narratage/provider-kie` is one separately selected Runtime Endpoint
implementation; another Provider can implement the same exact capability without changing Core.

The package is directly activatable and currently offers exact compute Fragments rather than a bundled
high-level author Surface.
