# `@hypit/media-local`

Bounded local FFprobe/FFmpeg execution and parsing. It implements Media inspection and byte execution without owning
Project Boundary, Media Asset documents, Catalog state, NLE placement or automatic inspection fallback.

`resolveLocalMediaToolchain()` closes one embedding-selected `ffmpegPath` and `ffprobePath`, defaulting to `ffmpeg`
and `ffprobe` on the Host `PATH`. `inspectLocalMediaToolchain()` reports their versions or a precise availability
diagnostic. The package does not install either executable; an embedding or application distribution supplies them.

`indexLocalVideoFrames()` and `localVideoFrameOrdinal()` resolve selected-stream frame positions for the HTML renderer
and Media views. `renderLocalMediaView()` produces a thumbnail, storyboard atlas, waveform or WAV audition from
one resolved Media Asset and a bounded source-clock request.

`LocalMediaSourcePreviews` resolves requested positions to fixed source-clock blocks and stores rebuildable
picture samples and numeric waveform blocks at multiple resolutions in an embedding-supplied cache directory.
The same blocks serve any occurrence of the source.

Audio Program playback buffers, WAV delivery and Programme waveform output share one graph execution path. The
executor composes the occurrence and accepted Audio-member time maps before resolving sample boundaries. It reads
positive, unwrapped affine segments, preserving pitch at rates other than 1×, and keeps silence between segments.
Process controls use the composed programme clock and hold the boundary value through an unmapped interval.
