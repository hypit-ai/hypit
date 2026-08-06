# `@svml/provider-media-local`

Trusted local ffprobe/ffmpeg implementation of `@svml/media-pipeline`'s four exact byte-operation
capabilities. It is Runtime configuration and is never imported by author `.svml`.

```ts
import { createProjectLocalRuntime } from "@svml/local";
import { createLocalMediaProvider } from "@svml/provider-media-local";

const runtime = await createProjectLocalRuntime({
  packageLock: "./svml.packages.lock",
  providers: [createLocalMediaProvider({ defaultConcurrency: 1 })],
  allowedPermissions: ["process:media"],
});
```

The Provider:

- bounds subprocess duration and ffprobe JSON size;
- invokes binaries without a shell;
- enumerates all streams and records ffprobe implementation identity;
- maps explicit stream indexes into ffmpeg instead of relying on `0:v:0` / `0:a:0` guesses;
- uses the selected authority stream's presentation interval;
- preserves source A/V offset through deterministic trim, delay, pad and crop operations;
- emits a silent CFR H.264 visual and, when selected, an exact-length 48 kHz stereo PCM WAV.
- renders an explicit `AudioProgramPlan` into one exact-length 48 kHz stereo PCM `TimelineAudio`;
- muxes exactly one verified silent visual stream and one verified program-audio stream into MP4;
- distinguishes AAC coding-frame padding from the authoritative packet presentation span.

Video-backed normalization is video-authoritative so an AAC packet tail cannot extend the program
past its final picture. Audio-only normalization is audio-authoritative. A future AWS media Provider
must return the same public contracts and timing laws; Lambda is an execution topology, not another
author meaning.
