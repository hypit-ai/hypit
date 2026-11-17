# `@hypit/media-local`

Bounded local FFprobe/FFmpeg execution and parsing. It implements Media inspection and byte execution without owning
Project Boundary, Media Asset documents, Catalog state, NLE placement or automatic inspection fallback.

`resolveLocalMediaToolchain()` closes one embedding-selected `ffmpegPath` and `ffprobePath`, defaulting to `ffmpeg`
and `ffprobe` on the Host `PATH`. `inspectLocalMediaToolchain()` reports their versions or a precise availability
diagnostic. The package does not install either executable; an embedding or application distribution supplies them.
