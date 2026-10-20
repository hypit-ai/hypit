# @hypit/html-playback

Browser playback adapter for a compiled `HtmlProgram` and `AudioProgram`.

`html-program` owns visual layout and exact frame evaluation. `media-operations`
owns the audio program. This package materializes their browser elements and
drives both from one absolute Program frame without adding playback concepts to
either domain value. Studio and embeddable HTML documents are hosts of this
adapter.
