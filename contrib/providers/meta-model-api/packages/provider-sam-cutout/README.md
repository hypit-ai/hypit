# @example/provider-sam-cutout

Hypit project Provider that fulfills `@hypit/volcengine-matting@1#matte-portrait-video` with
**SAM 3.1** (Segment Anything Model, Meta Model API). Authors keep writing
`<matte:Portrait source={...} format="MOV"/>`; SAM segments and tracks the configured concept
through the clip and each frame's mask becomes that frame's alpha channel.

## Two capabilities

| Capability | Where the concept comes from | Use |
|---|---|---|
| `@hypit/volcengine-matting@1#matte-portrait-video` | Endpoint config `concept` | Portrait matting through the existing model; one concept per project/profile |
| `@hypit/sam-cutout@1#sam-3.1-cutout` | authored `prompt` attribute | Per-run concept: `<sam:Cutout id="c" prompt="yellow school bus" source={clip}/>` |

The second one is a new model package, `packages/sam-cutout` in the Hypit checkout, because the
matte contract has no prompt port and no provider-side channel could carry one. Both are served by
this one provider; the endpoint declares both capabilities.

Endpoint options: `baseUrl`, `apiKey`, `model`, `concept`, `timeoutMs`, `concurrency`, and
`compatibilityCopy` (encode a ProRes MOV from the same frames alongside a WEBM request).

## Why this capability and not a new Model

Hypit's model catalogue has no segmentation contract: the only media-out capability whose ports fit
a mask-producing service is `matte-portrait-video` (`source` video in, generated video out). Writing
a new Model would mean adding a capability to the compiler, not wiring a provider. What SAM adds
over an opaque matting service is object identity across frames and a noun-phrase prompt — the
prompt is Endpoint configuration (`concept`), because the capability carries no prompt port.

## Endpoint config

```json
"sam.matte": {
  "use": "@example/provider-sam-cutout",
  "config": {
    "baseUrl": "https://api.meta.ai/v1",
    "apiKey": { "store": "local", "key": "sam.matte" },
    "model": "sam-3.1",
    "concept": "person"
  }
}
```

Binding: `"@hypit/volcengine-matting@1#matte-portrait-video": "sam.matte"`.

Store the key with `hypit auth login sam.matte --from <file>`, then `hypit runtime down && hypit
runtime up` (the endpoint package is imported at worker start).

## Requirements

- `ffmpeg`/`ffprobe` on `PATH` (or `FFMPEG_PATH`/`FFPROBE_PATH`).
- Node 22/24: `@meta-sam/parser` declares `^20.17.0 || >=22.9.0`.

## Measured behaviour (2026-11-12, 2 s / 50-frame 640x640 H.264 clip)

| Fact | Value |
|---|---|
| Upload + inference + 50-frame composite + encode | 24-26 s |
| Mask records returned | 50 (one per frame), one stable object id |
| Alpha coverage on frame 10 | 37.53 % (WEBM) / 37.55 % (MOV) |
| Output WEBM | VP9, `yuv420p` + `alpha_mode=1`, 53,066 bytes, 2.000 s |
| Output MOV | ProRes 4444, `yuva444p12le`, 9,352,885 bytes, 2.000 s |
| Direct transport run vs Hypit Build | frame 25: 0.3748 vs 0.3747 coverage (reproducible) |
| Price | $0.20 / 1k video frames (image route $2.50 / 1k images) |

## Limits, stated rather than hidden

- **Both formats carry alpha, but WebM's is out of band.** `ffprobe` reports `pix_fmt=yuv420p` for a
  real WebM cutout; the marker is the `alpha_mode=1` tag, and reproducing the alpha plane requires
  `-c:v libvpx-vp9` at decode time (the native `vp9` decoder shows none). The transport decodes the
  encoded file back and refuses to return a clip whose alpha plane is missing or disagrees with the
  composed frame by more than 2 % coverage.
- **MOV is ~176x larger** for the same clip, and is the right choice when the next tool cannot read
  WebM alpha.
- **Concept granularity**: use `@hypit/sam-cutout@1#sam-3.1-cutout` for per-run prompts. The matte
  capability can only take the Endpoint's configured concept; per-concept profiles are in
  `hypit.runtime.product.json` alongside the default profile.
- **Audio** is carried: the source's first audio stream is muxed onto the cutout with `-c:v copy`
  (Opus for WEBM, PCM for MOV), and the alpha plane is re-verified afterwards. A silent source is a
  no-op. Measured: exported artifact has `vp9 + alpha_mode=1` and `opus 1ch`, 88,512 bytes, alpha
  coverage unchanged at 0.3753.
- **Dual delivery works**: with `compatibilityCopy: true`, one paid call yields two stored artifacts
  and two addressable outputs — `cutout.video` (WEBM, VP9 + `alpha_mode=1`) and `cutout.alternate`
  (ProRes 4444 MOV). Measured on one build: 53,469 B and 9,347,851 B, both 0.3754 alpha coverage at
  frame 10, from a single provider request. Targeting `alternate` without `compatibilityCopy` fails
  with "Generated video set has no alternate artifact" rather than returning the WebM twice.
- `tools/webm-to-mov.mjs` remains for converting an existing WebM outside a Build (verified 0.3748
  vs 0.3748 coverage, audio preserved).
- Frames SAM skips carry the previous mask forward; the count is reported in the progress detail.
- A concept that matches nothing fails the step with the measured reason instead of producing an
  empty clip.
