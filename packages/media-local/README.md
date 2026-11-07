# `@hypit/media-local`

Trusted direct ffprobe/ffmpeg engine. It exposes three direct ports:

- the main and `@hypit/media-local/execution` entries execute byte operations against an explicitly
  supplied `ResourceStore`;
- `@hypit/media-local/files` inspects or creates files explicitly named by an authoring tool;
- `@hypit/media-local-cli` presents those explicit file operations as `hypit media`.

None of these ports creates a Graph, Build, Result, Endpoint or Runtime state. The optional Runtime
adapter is the separate `@hypit/provider-media-local` package.

An embedding that already owns a `ResourceStore` may also construct the same local execution
environment directly. This is the byte/tool boundary reused by direct delivery and optional adapters;
it does not infer a project directory or create Runtime state:

```ts
import { createMediaExecutionEnvironment } from "@hypit/media-local";

const execution = createMediaExecutionEnvironment(resources, {
  ffmpegPath: "ffmpeg",
  ffprobePath: "ffprobe",
});
```

This package owns its FFmpeg commands, media inspection, animated-WebP handling and audio-program
execution. They are implementation details of this direct machine executor, not shared domain models
or a root `@hypit/hypit` facade. A Provider may adapt these operations to public Needs without moving
Endpoint policy back into this package.

The local process runner is shared by execution and file ports, so bounds, shell avoidance and
failure reporting do not fork into two executors. Inspection and extraction contracts remain in
`@hypit/media`, audio Programme execution in `@hypit/audio-program`, and terminal assembly
in `@hypit/media-delivery`; paths, subprocesses and ffprobe output remain here.

## File authoring and inspection

```bash
hypit media import reference.mp4 --to assets/reference.media.json
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
`importLocalMediaAsset()`. It performs one exact inspection, applies an explicit local stream-selection policy,
optionally copies the source below the manifest, and atomically creates `hypit.media-asset@1`. Copy is the portable
default. `--link` is accepted only when the source already lies below the manifest directory. Existing files are
never overwritten.

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
consume a `SpeechTranscriptEvidence` JSON file; exact decoding and phrase matching are owned by
`@hypit/speech-evidence`, while
this package only joins those ranges to file decoding.

## Direct media execution

The engine:

- bounds subprocess duration and metadata response size; decoded frame facts are consumed one compact
  line at a time, so long media does not require one complete frame JSON document in memory;
- invokes binaries without a shell;
- enumerates all streams while toolchain inspection reports executable versions separately;
- publishes presentation endpoints only when decoded-unit facts support the final boundary;
  it does not promote cadence estimates or gap thresholds into exact timing;
- maps explicit stream indexes into ffmpeg instead of relying on `0:v:0` / `0:a:0` guesses;
- evaluates each selected signal through its Prepared Media map onto the shared local domain when a concrete operation needs bytes;
- preserves source A/V offset as transparent visual gaps or silent audio gaps without reconstructing
  span authority inside the executor;
- emits exactly the requested terminal signal: a silent CFR visual or an exact-length 48 kHz stereo PCM WAV;
- evaluates source-preserving trim/retime relations privately, extracts generic reference audio and extracts exact source frames;
- renders a supported explicit `AudioProgram` into one exact-length 48 kHz stereo PCM `RenderedAudio`;
- muxes exactly one verified silent visual stream and one verified program-audio stream into MP4, including a valid one-frame video;
- re-observes the RenderedVisual bytes at that terminal boundary and requires their frame rate, canvas, codec,
  pixel format and picture metadata to match the declared delivery; a value declaration is not treated as evidence
  about arbitrary bytes supplied under its Artifact reference;
- distinguishes AAC coding-frame padding from the authoritative packet presentation span.

During one `render-audio` request, selected sources and transform working files stay in that request's temporary
directory. The requested output sample range is projected through the closed AudioProgram into one request-local demand plan.
Source preparation and the signal reader consume that same plan, so a partial render neither decodes
nor later asks for an unrelated signal use. Each Prepared Media and occurrence Map is validated and bound once while building
that plan; range projection and sample reading retain the same sided evaluator instance. Reverse, hold, gaps, wrapping and cubic
relations therefore cannot acquire a separate demand interpretation, and structural Map checks do not run once per output sample.
A selected source may still be decoded as a complete canonical PCM track in this first implementation; that execution choice does
not widen the plan or become Programme metadata. Only the final `RenderedAudio`
Artifact enters the supplied resource gateway; decoder intermediates remain request-private.

Private visual evaluation preserves alpha across trim/retime: transparent input becomes
VP9 / `yuva420p` WebM, while opaque input uses H.264 / `yuv420p` MP4. The input pixel format and WebM alpha metadata
determine the choice at each private execution step.
Animated WebP is also evaluated through an alpha-capable output. Transparent VP8/VP9 input uses libvpx
decoders so FFmpeg retains the alpha sidecar, including during PNG frame extraction.
Transparent evaluation requires an FFmpeg build with the `libvpx-vp9` encoder; the normal
process error reports a missing codec if a custom deployment does not provide it.
The lossless alpha encoding uses libvpx row threading and its realtime effort profile. Those options
change encoder work while preserving the decoded frames. They are private to this FFmpeg implementation:
author and Track inputs remain `PreparedMedia`, while temporal transformation remains an exact
prepared-time relation rather than an FFmpeg operation identity.

Timeline construction consumes PreparedMedia's exact Extent; a Visual Clip or project scene requests
its transparent picture according to the authored relationship. The
local HTML renderer extracts alpha-preserving PNGs and composites them against the authored
Canvas and lower visual layers before encoding the final MP4.

Visual and audio requests independently consume their own Prepared Media member map. Either selected
signal may have established the shared domain: an audio-authoritative A/V value therefore yields
transparent picture outside the visual member's mapped range, while a video-authoritative value yields
silence outside the audio member's mapped range. Audio-only media require no visual frame rate. Other
implementations of these capabilities must preserve the same public values and timing laws; a different
execution topology leaves author meaning unchanged.

The local audio Renderer evaluates the complete occurrence and Prepared Media maps as one signal
pullback. Affine, reverse, hold, wrap, gap, cubic and multi-stage relations therefore use the same
execution path. Selected source streams are decoded once per request to canonical 48 kHz stereo PCM;
the Renderer reads them through a bounded page cache, evaluates the closed signal graph and adds the resulting
signals in output blocks. The AudioProgram is one closed signal graph.
It does not infer pitch-preserving stretch from a temporal relation: such a
reconstruction policy belongs to the mapped nested Programme use and has its own package owner. The renderer
implements `@hypit/audio-preserve-pitch` PreservePitch when that use has a direct one-media-leaf child Programme and a
complete positive-affine, non-looping Mapping;
its source trim keeps exact rational boundaries through Map composition and uses Temporal's shared nearest-boundary
rule on the 48 kHz grid. Only the final FFmpeg tempo parameter is floating point.
Other relations, child Programme shapes or reconstruction formats are accurately unsupported rather than silently resampled.
Speech-evidence projection remains intentionally narrower and reports its positive-affine, non-looping
signal boundary instead of rewriting the preserved media relation.

## Optional Runtime adapter

`@hypit/provider-media-local` maps these direct operations to Endpoint capabilities, declares which
operations are transient, owns Runtime capacity, and diagnoses explicitly selected tool paths. Direct
NLE export, file import and authoring commands do not load that adapter.
