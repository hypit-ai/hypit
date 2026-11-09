# `@hypit/media-file-local`

Direct local-file media tools: probe, cut, frames, grids, waveforms, spectrograms and visual
boundaries. Transcript overlays are optional authoring observations; they are deliberately outside
the neutral `@hypit/media-local` execution closure used by NLE export.

The package creates no Runtime, Build or retained graph state. Callers name input and output files.
Its `@hypit/media-file-local/cli` export contributes the `media` root when an application or project
explicitly selects it. The main export remains the callable file API; importing it never activates a command.

## File authoring and inspection

```bash
hypit media import reference.mp4 --to assets/reference.media.json
hypit media import unusual.mkv --inspect-decoded-frames --to assets/unusual.media.json
hypit media probe reference.mp4
hypit media cut reference.mp4 --start 12 --end 19.5 --to assets/hook.mp4
hypit media frames reference.mp4 --at 12.4,13.1 --to notes/hook-frames
hypit media grid reference.mp4 --start 12 --end 19.5 --no-time --to notes/pictures.jpg
hypit media grid reference.mp4 --start 12 --end 19.5 --header --to notes/evidence.jpg
hypit media grid reference.mp4 --start 12 --end 19.5 --waveform --to notes/hook-grid.jpg
hypit media grid reference.mp4 --start 12 --end 19.5 --spectrogram --to notes/frequency-grid.png
hypit media grid reference.mp4 --start 12 --end 19.5 --transcript notes/transcript.json \
  --waveform --spectrogram --frame-marker-color '#59d8ff' --to notes/word-grid.png
hypit media grid reference.mp4 --pages --ranges notes/ranges.json --format png --to notes/grids
hypit media waveform reference.mp4 --start 12 --end 19.5 --to notes/hook-waveform.png
hypit media spectrogram reference.mp4 --around 'glass breaks' --transcript notes/transcript.json \
  --pixels-per-second 240 --to notes/glass-break-frequency.png
hypit media boundaries reference.mp4
```

`media import` is the shared headless import path used by the CLI and available to a desktop Host through
`importLocalMediaAsset()`. Its normal path reads exact integer timing already declared by the container index,
applies an explicit local stream-selection policy,
optionally copies the source below the manifest, and atomically creates `hypit.media-asset@1`. Copy is the portable
default. `--link` is accepted only when the source already lies below the manifest directory. Existing files are
never overwritten.

Container-index import never enumerates decoded frames and never silently falls back to doing so. If an unusual
or incomplete container does not declare the timing required by the requested stream selection, import fails with
that cause. The caller may then deliberately choose `--inspect-decoded-frames` (or
`inspectionMode: "decoded-frames"`) and pay the full-file inspection cost. Generated/rendered byte verification
uses the separately named decoded-frame inspection directly; optimizing author import does not weaken terminal
output checks. PNG and JPEG are declared constant Pictures from their media type. WebP is not silently treated as
constant because the same file type may be animated; choose decoded-frame inspection for WebP import.

The import call accepts an `AbortSignal` and progress callback with `inspect | interpret | copy | publish | complete`
stages. These are invocation facts, not Media Asset or NLE fields. A CLI invocation waits in the foreground; a
Studio Host may display the same task in the background and apply `media.add + item.add` only after it completes.
Neither path requires a persistent queue. Long-running Analyzers may later use Runtime scheduling while continuing
to publish ordinary Representation files.

A drag-and-drop Host closes the import into NLE with ordinary public APIs:

```ts
const imported = await importLocalMediaAsset(request, { signal, progress });
const transaction = createMediaAssetMaterialization(project, {
  mediaId: "interview",
  itemId: "interview-use",
  name: "Interview",
  asset: { path: "./media/interview.media.json" },
  interpretation: imported.document.media.interpretation,
  track: "picture-main",
  at: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
});
```

The Host applies that transaction only after import succeeds. Subsequent trim, split, layout, Effect and Audio edits
are ordinary NLE transactions; they neither rerun inspection nor modify the asset manifest.

Network acquisition is not a media-execution operation. `@hypit/yt-dlp/cli` owns
`hypit download`; the resulting file becomes an ordinary input to these commands.

Frame extraction, native-PTS sequences and labelled grids are evidence about a source media clock.
They therefore live beside the decoder that establishes that clock. `HtmlProgram` frames remain an
`html-program` concern, and capturing Studio's current `HtmlProgram` remains a Studio concern; the word
“frame” does not create a central package.

`grid` observes frames first, then independently composes optional cell annotations, a page header,
an amplitude waveform and a frequency spectrogram. Any of those presentation parts may be omitted.
Time annotations are shown by default; `--no-time` removes cell times and attached audio time axes,
producing picture-only cells when neither a transcript nor an audio view is supplied. `--transcript`
adds width-adaptive word context using the actual decoded frame time even when that time is not printed;
`--word-context` chooses an explicit radius. `--header` adds only the source name, page source-time range
and frame count. Attached audio views number their frame markers and matching cells. Exact requested and decoded
times remain in `--json`, independently of what is drawn. Single grids use their destination extension;
paged grids choose JPEG or lossless PNG with `--format`.

`waveform` and `spectrogram` are equal, independent source-clock observations. A waveform exposes
amplitude and is useful for transients, envelopes and pauses. A spectrogram exposes frequency over time
and is useful for tonal content, noise, speech texture and effects. Either or both may occupy their own
track beneath a grid, and each is also a standalone command. `--pixels-per-second` keeps time density
stable across intervals; `--around` selects a transcript phrase. Waveform filter and amplitude scale do
not configure the spectrogram; frequency scale, frequency range and dynamic range do not configure the
waveform. Both can split channels, choose a stream, hide their time axis and share the grid's independently
selected frame-marker color.

Audio-only media can produce either audio observation but not a frame grid, while a silent video cannot
produce an audio observation. Multiple audio streams require an explicit container stream index. Reusing
these local presentation functions does not transfer frame acquisition or Runtime authority. Transcript-aware ranges
consume a `TimedTranscript` JSON file; exact decoding and phrase matching are owned by
`@hypit/timed-transcript`, while
this package only joins those ranges to file decoding.
