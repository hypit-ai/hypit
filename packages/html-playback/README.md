# @hypit/html-playback

Browser playback adapter for a compiled `HtmlProgram` and `AudioProgram`.

`html-program` owns visual layout and exact frame evaluation. `audio-program`
owns the audio Programme. This package lowers them into browser playback elements and
drives both from one absolute Program frame without adding playback concepts to
either domain value. Studio and embeddable HTML documents are hosts of this
adapter.

Direct media playback uses `HtmlProgram.videoSources`: the adapter evaluates each occurrence's exact
`TemporalMap` into source presentation timestamps for the Program frames. Surface sources retain their
frame-addressed relation. The generated preview never reconstructs sampling from filenames or average frame rate.

Native media elements are an explicitly narrower preview endpoint. They do not reliably select an arbitrary
stream from a multi-stream container, and audio playback can execute only the linear relations supported by
`HTMLMediaElement`; the adapter rejects every nonzero selected visual or audio stream and rejects other
audio relations instead of allowing the browser to choose a different stream or approximate a map. Exact
selected-stream and arbitrary-map execution belongs to a capable offline Renderer. A future
demux-capable playback adapter may close this preview gap without changing `PreparedMedia`, Film, or either
Programme.

Audio reconstruction is explicit in AudioProgram. Ordinary sampling sets the browser's
`preservesPitch` flag to `false`; `@hypit/audio-stretch` PreservePitch sets it to `true`. The adapter
therefore never inherits a browser default that disagrees with offline rendering, and an unknown
reconstruction programme is rejected at this adapter boundary.
