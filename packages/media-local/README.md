# `@hypit/media-local`

Bounded local FFprobe/FFmpeg execution and parsing. It implements Media inspection and byte execution without owning
Project Boundary, Media Asset documents, Catalog state, NLE placement or automatic inspection fallback.

`resolveLocalMediaToolchain()` closes one embedding-selected `ffmpegPath` and `ffprobePath`, defaulting to `ffmpeg`
and `ffprobe` on the Host `PATH`. `inspectLocalMediaToolchain()` reports their versions or a precise availability
diagnostic. The package does not install either executable; an embedding or application distribution supplies them.

`indexLocalVideoFrames()` and `localVideoFrameOrdinal()` resolve selected-stream frame positions for the HTML renderer
and Media views. `renderLocalMediaView()` produces a thumbnail, storyboard atlas, waveform or WAV audition from
one resolved Media Asset and a bounded source-clock request.
