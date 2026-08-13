# SVML Playground

A read-only preview of one `.svml` Source: the code on the right, the picture
top-left, and a timeline bottom-left rendered from the Source itself.

```bash
pnpm svml:playground -- --source examples/talking-film-broll-preview/main.svml
# ➜  http://localhost:5179/
```

Optional: `--run <build.svrun>` to read material a Run Source already names, and
`--port <number>`.

Selecting works from any of the three panes and selects in all of them: click a
timeline clip, marked text in the source, or the picture itself. Lines that bind
a clip carry a coloured bar in the gutter.

A Segment encloses a Selection, which can enclose another. Each level has its
own colour, and an enclosing range stays outlined while an inner one is — the
nesting is what the markers are for. Everything the playhead is inside is
outlined as it passes, and clicking marked prose lands inside the marker you
clicked rather than at the start of whatever encloses it.

`Space` plays and pauses, `←` and `→` step a frame with `Shift` ten, `Home` and
`End` jump to the ends, `Esc` clears. The Speech Spine's material sounds during
playback; the speaker button turns it off.

## What it is for

Reading a Source as a timeline **before** anything has been generated. It answers
"where does this B-roll land, how long is it, and is the card in the right part
of the frame" without a Seedance generation, a WhisperX alignment, an FFmpeg
render or a headless browser.

It never writes. There is no route that can change what an author wrote, and no
form that edits a Recipe — that is the Caption Playground's job, not this one.

## What is real and what is estimated

Everything structural is real. Placement Frames, padding, stacking order, motion
and the Track layout are computed by the same functions the build calls, from the
Source and its style sheet.

**Timings prefer real things,** in this order, and the header badges say which
you are looking at:

1. A completed build in `.svml/state.sqlite` — its `timing.map` and
   `speech.space` replace the estimate outright, and its `final.video` becomes
   the picture.
2. A Run Source — `<file>` bound by `<satisfy>` is material you already have, so
   it can be the picture with no build at all.
3. The Script text — token windows from `@narratage/estimate`, the same
   delivery-density model the pipeline uses before generation.

Real cut points move once WhisperX has aligned real audio, so treat an estimated
timeline as a proportion, not a prediction. If a store is from a newer schema, or
its build never completed, the Playground falls back to estimates rather than
showing a measured timeline it cannot vouch for.

**Material degrades one element at a time.** A Take or an Item shows real frames
when its source already exists and already lives in the program's frame domain,
and a painted rectangle when it does not. Normalizing footage of another frame
rate is the media pipeline's job and takes a real transcode, so the preview
refuses and says which file and why rather than quietly resampling.

## How it reads a Source

A shallow interpreter, not the compiler. It walks the authored markup with
`@narratage/markup`'s own parser and calls each package's own pure projection
functions — `frameFromEdges`, `appendSelectionMediaItem`, `finalizeMediaTrack`,
`projectMediaVisualTrack`. It never elaborates the graph, never resolves a
package lock, and never constructs a Host, so it runs on a directory containing
nothing but `main.svml` and `studio.svs`.

Interpreted: `<script>`, the Spatial Frames, `<speech:Spine>` and its Takes,
`<media-track:Track>` and its Items, `<fonts:Stack>`, `<caption-fine:Style>` and
`<caption-fine:Track>`, `<film:Film>` (for the clear colour), and `.svs` source
imports.

Everything else — every generation Surface, `<whisperx:Alignment>`, the
Typography Tracks, `<render:Video>` — is read, listed under "not projected",
and skipped. A Source is worth previewing even when most of
it is produced by Providers.

## A note on `<space:Frame>`

`right` and `bottom` are **absolute edge positions**, not insets. A Frame
spanning the middle 80% of its parent is `left="8%" right="92%"`, not
`left="8%" right="8%"` — the latter resolves to zero width and is rejected.
