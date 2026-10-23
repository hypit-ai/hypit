# `@hypit/media-local`

Trusted local ffprobe/ffmpeg owner. It exposes the same concrete local-media behavior through three
orthogonal ports:

- a Provider port implements `@hypit/media-operations` Needs against a Build's ResourceStore;
- `@hypit/media-local/files` inspects or creates files explicitly named by an authoring tool;
- `@hypit/media-local/cli` presents that file port as `hypit media`.

The Provider is Runtime configuration and is never imported by author `.svml`. The file and CLI ports
do not manufacture a Graph, Build, Result or Runtime state.

This Provider owns its FFmpeg commands, media inspection, animated-WebP handling and audio-program
execution. They are implementation details of this machine executor, not a shared domain package or
a root `@hypit/hypit` facade. Another Provider implements the same Needs against the public operation
contracts rather than importing this Provider's process code.

The local process runner is shared by the Provider and file ports, so bounds, shell avoidance and
failure reporting do not fork into two executors. Domain contracts remain in `@hypit/media-operations`;
paths, subprocesses and ffprobe output remain here.

## File authoring and inspection

```bash
hypit media probe reference.mp4
hypit media cut reference.mp4 --start 12 --end 19.5 --to assets/hook.mp4
hypit media frames reference.mp4 --at 12.4,13.1 --to notes/hook-frames
hypit media grid reference.mp4 --start 12 --end 19.5 --no-time --to notes/pictures.jpg
hypit media grid reference.mp4 --start 12 --end 19.5 --header --to notes/evidence.jpg
hypit media grid reference.mp4 --start 12 --end 19.5 --waveform --to notes/hook-grid.jpg
hypit media grid reference.mp4 --start 12 --end 19.5 --spectrogram --to notes/frequency-grid.png
hypit media grid reference.mp4 --start 12 --end 19.5 --transcript notes/transcript.svml \
  --waveform --spectrogram --frame-marker-color '#59d8ff' --to notes/word-grid.png
hypit media grid reference.mp4 --pages --ranges notes/ranges.json --format png --to notes/grids
hypit media waveform reference.mp4 --start 12 --end 19.5 --to notes/hook-waveform.png
hypit media spectrogram reference.mp4 --around 'glass breaks' --transcript notes/transcript.svml \
  --pixels-per-second 240 --to notes/glass-break-frequency.png
hypit media boundaries reference.mp4
```

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
consume a `<speech:Transcript>` SVML Source; exact decoding and phrase matching are owned by
`@hypit/speech-evidence`, while
this package only joins those ranges to file decoding.

```ts
import { createLocalMediaProvider } from "@hypit/media-local";

const media = createLocalMediaProvider({ instance: "media.local", defaultConcurrency: 1 });
```

An embedding adds `media` to a complete explicit Runtime assembly and grants `process:media`; the
declarative form selects this package through the Runtime Profile.

The Endpoint:

- bounds subprocess duration and ffprobe JSON size;
- invokes binaries without a shell;
- enumerates all streams and records ffprobe implementation identity;
- maps explicit stream indexes into ffmpeg instead of relying on `0:v:0` / `0:a:0` guesses;
- uses the selected authority stream's presentation interval;
- preserves source A/V offset through deterministic trim, delay, pad and crop operations;
- emits a silent CFR visual and, when selected, an exact-length 48 kHz stereo PCM WAV;
- transforms synchronized A/V, extracts generic reference audio and extracts exact source frames;
- encodes authored image frames as ordinary finite video-only MP4 with explicit BT.709 conversion and
  colour metadata before normalization;
- renders an explicit `AudioProgram` into one exact-length 48 kHz stereo PCM `TimelineAudio`;
- muxes exactly one verified silent visual stream and one verified program-audio stream into MP4;
- distinguishes AAC coding-frame padding from the authoritative packet presentation span.

Normalize preserves alpha: transparent input becomes VP9 / `yuva420p` WebM, while opaque input
uses H.264 / `yuv420p` MP4. The input pixel format and WebM alpha metadata determine the choice.
Opaque H.264 / `yuv420p` video in Baseline, Main or High profiles up to level 4.1 may reuse its
encoded frames when `media-local` proves that every decoded frame already has the requested ordinal,
timestamp, duration, geometry, square pixels and zero display rotation. A single-video-stream MP4 is
reused directly; another matching container is remuxed to a silent MP4 and inspected again. Inputs
outside those provider-local copy criteria use the normal transcode path.
Animated WebP is also normalized through an alpha-capable output. Transparent VP8/VP9 input uses libvpx
decoders so FFmpeg retains the alpha sidecar, including during PNG frame extraction.
Transparent normalization requires an FFmpeg build with the `libvpx-vp9` encoder; the normal
process error reports a missing codec if a custom deployment does not provide it.
The lossless alpha encoding uses libvpx row threading and its realtime effort profile. Those options
change encoder work while preserving the decoded frames and public SynchronizedMedia value.
These are this FFmpeg implementation's intermediate encodings; Source and Track inputs continue
to use ordinary SynchronizedMedia. Transform currently emits opaque MP4, so perform trim/retime
before matting when the resulting clip needs transparency.

The result is ordinary SynchronizedMedia. Timeline construction consumes its local domain; a Visual
Clip or project scene consumes its transparent picture according to the authored relationship. The
local HTML Provider extracts alpha-preserving PNGs and composites them against the authored
Canvas and lower visual layers before encoding the final MP4.

The Runtime Adapter declares the selected `ffmpeg`/`ffprobe` pair as an external, non-daemon Program.
Its probe checks that the selected executables start in the media execution environment. It does not
guarantee every codec or filter for every task; an unsupported operation reports FFmpeg’s actual error. Custom paths
remain valid; the package neither pins a semantic Capability to one FFmpeg version nor mutates a
system package manager.

The reusable display-materialization capabilities—inspection, normalization, transform, extraction,
StillVideo—also opt into transient authoring execution. Speech-evidence projection,
timeline-audio rendering and final muxing remain Build-only. This is declared per capability; the
Runtime and Studio contain no media capability allowlist.

Video-backed normalization is video-authoritative so an AAC packet tail cannot extend the program
past its final picture. Audio-only normalization is audio-authoritative. Other implementations of these capabilities must preserve the same public values and timing laws;
a different execution topology leaves author meaning unchanged.
