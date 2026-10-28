# `@hypit/media-local`

Trusted local ffprobe/ffmpeg owner. It exposes the same concrete local-media behavior through three
orthogonal ports:

- a Provider port implements material operations, audio Programme rendering and media delivery Needs
  against a Build's ResourceStore;
- `@hypit/media-local/files` inspects or creates files explicitly named by an authoring tool;
- `@hypit/media-local/cli` presents that file port as `hypit media`.

The Provider is Runtime configuration and is never imported by author `.svml`. The file and CLI ports
do not manufacture a Graph, Build, Result or Runtime state.

This Provider owns its FFmpeg commands, media inspection, animated-WebP handling and audio-program
execution. They are implementation details of this machine executor, not a shared domain package or
a root `@hypit/hypit` facade. Another Provider implements the same Needs against the public operation
contracts rather than importing this Provider's process code.

The local process runner is shared by the Provider and file ports, so bounds, shell avoidance and
failure reporting do not fork into two executors. Material contracts remain in
`@hypit/media-operations`, audio Programme execution in `@hypit/audio-program`, and terminal assembly
in `@hypit/media-delivery`; paths, subprocesses and ffprobe output remain here.

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
- enumerates all streams while the Runtime-owned toolchain reports its executable versions separately;
- maps explicit stream indexes into ffmpeg instead of relying on `0:v:0` / `0:a:0` guesses;
- evaluates each selected signal through its Prepared Media map onto the shared local domain when a concrete operation needs bytes;
- preserves source A/V offset as transparent visual gaps or silent audio gaps without reconstructing
  span authority inside the Provider;
- emits exactly the requested terminal signal: a silent CFR visual or an exact-length 48 kHz stereo PCM WAV;
- evaluates source-preserving trim/retime relations privately, extracts generic reference audio and extracts exact source frames;
- encodes authored image frames as ordinary finite video-only MP4 with explicit BT.709 conversion and
  colour metadata before preparation;
- renders a supported explicit `AudioProgram` into one exact-length 48 kHz stereo PCM `TimelineAudio`;
- muxes exactly one verified silent visual stream and one verified program-audio stream into MP4;
- distinguishes AAC coding-frame padding from the authoritative packet presentation span.

During one `render-timeline-audio` request, selected sources and transform working files stay in that request's temporary
directory. Only the final `TimelineAudio` Artifact enters the Build resource gateway; decoder intermediates are not Results.

Private visual evaluation preserves alpha across trim/retime: transparent input becomes
VP9 / `yuva420p` WebM, while opaque input uses H.264 / `yuv420p` MP4. The input pixel format and WebM alpha metadata
determine the choice at each private execution step.
Opaque H.264 / `yuv420p` video in Baseline, Main or High profiles up to level 4.1 may reuse its
encoded frames when `media-local` proves that every decoded frame already has the requested ordinal,
timestamp, duration, geometry, square pixels and zero display rotation. A single-video-stream MP4 is
reused directly; another matching container is remuxed to a silent MP4 and inspected again. Inputs
outside those provider-local copy criteria use the normal transcode path.
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
local HTML Provider extracts alpha-preserving PNGs and composites them against the authored
Canvas and lower visual layers before encoding the final MP4.

The Runtime Adapter declares the selected `ffmpeg`/`ffprobe` pair as an external, non-daemon Program.
Its probe checks that the selected executables start in the media execution environment. It does not
guarantee every codec or filter for every task; an unsupported operation reports FFmpeg’s actual error. Custom paths
remain valid; the package neither pins a semantic Capability to one FFmpeg version nor mutates a
system package manager.

The reusable byte operations—inspection, extraction and StillVideo—also opt into transient authoring execution. Speech-evidence projection,
timeline-audio rendering and final muxing remain Build-only. This is declared per capability; the
Runtime and Studio contain no media capability allowlist.

Visual and audio requests independently consume their own Prepared Media member map. Either selected
signal may have established the shared domain: an audio-authoritative A/V value therefore yields
transparent picture outside the visual member's mapped range, while a video-authoritative value yields
silence outside the audio member's mapped range. Audio-only media require no visual frame rate. Other
implementations of these capabilities must preserve the same public values and timing laws; a different
execution topology leaves author meaning unchanged.

The local audio Renderer evaluates the complete occurrence and Prepared Media maps as one signal
pullback. Affine, reverse, hold, wrap, gap, cubic and multi-stage relations therefore use the same
execution path. Selected source streams are decoded once per request to canonical 48 kHz stereo PCM;
the Renderer reads them through a bounded page cache, applies Clip automation and adds the resulting
signals in output blocks. It does not infer pitch-preserving stretch from a temporal relation: such a
reconstruction policy is an explicit Clip reconstruction with its own programme owner. The Provider
implements `@hypit/audio-stretch` PreservePitch for a complete positive-affine, non-looping occurrence;
other relations or reconstruction formats are accurately unsupported rather than silently resampled.
Speech-evidence projection remains intentionally narrower and reports its positive-affine, non-looping
signal boundary instead of rewriting the preserved media relation.
