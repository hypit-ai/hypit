# `@hypit/provider-media-local`

Trusted local ffprobe/ffmpeg implementation of `@hypit/media-pipeline`'s nine exact byte-operation
capabilities. It is Runtime configuration and is never imported by author `.svml`.

```ts
import { createLocalMediaProvider } from "@hypit/provider-media-local";

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
- emits a silent CFR H.264 visual and, when selected, an exact-length 48 kHz stereo PCM WAV.
- transforms synchronized A/V, extracts generic reference audio and extracts exact source frames;
- encodes one authored image frame as an ordinary finite silent MP4 before normalization;
- renders an explicit `AudioProgramPlan` into one exact-length 48 kHz stereo PCM `TimelineAudio`;
- muxes exactly one verified silent visual stream and one verified program-audio stream into MP4;
- distinguishes AAC coding-frame padding from the authoritative packet presentation span.

The Runtime Adapter declares the selected `ffmpeg`/`ffprobe` pair as an external, non-daemon Program.
Its shared probe checks the encoders and filters used by the execution body. Compatible custom paths
remain valid; the package neither pins a semantic Capability to one FFmpeg version nor mutates a
system package manager.

The reusable display-materialization capabilities—inspection, normalization, transform, extraction,
StillVideo and stand-in drawing—also opt into transient authoring execution. Speech-evidence projection,
programme-audio rendering and final muxing remain Build-only. This is declared per capability; the
Runtime and Studio contain no media capability allowlist.

Video-backed normalization is video-authoritative so an AAC packet tail cannot extend the program
past its final picture. Audio-only normalization is audio-authoritative. The AWS Lambda media Provider
must return the same public contracts and timing laws; Lambda is an execution topology, not another
author meaning.
