# Validation: subject-layer composite (`<mediaop:Composite>`)

- Repository: `~/projects/hypit` @ `17393e5d` (fork `erdhian73/Hypit-Clone-Any-Video-`)
- Date: 2026-11-12 23:05–23:35 UTC
- Built against the plan in [plan-sam-object-prompts.md](./plan-sam-object-prompts.md) §Tier A follow-up:
  the first consumer of per-object masks, so a mask can occlude something instead of only existing.

## What was built

| Layer | Change |
|---|---|
| Markup | `<mediaop:Composite id under={video} over={subject}/>` — one Blob out, both operands are ordinary Blobs. |
| Capability | `@hypit/media-operations@1#composite-media` (returns `Blob`), producer `request-media-composite` with inputs `under`, `over` and one `video` Need. |
| Graph | `compositeMediaFragment`: two Blob inputs → one Need → `video` export. |
| Executor | `executeCompositeMedia` in `@hypit/media-local`: stage both Blobs, probe the under layer's frame size, scale the subject onto it, `overlay=0:0:eof_action=pass`, encode H.264 MP4, probe the result, store it. |
| Provider | `@hypit/media-local` endpoint registers `composite-media` as a transient local capability. |

Contract, as implemented: the **under layer decides frame size and duration**; the subject is scaled
onto it; where the subject stream ends the under layer shows through (`eof_action=pass`, never a
frozen last mask); output is an opaque MP4 with no audio.

## Verification

| Check | Result |
|---|---|
| `tsc -p tsconfig.json --noEmit` | clean |
| `packages/media-operations/test/composite.test.ts` | 3/3 — surface wiring, missing operands/children rejected, producer turns two Blobs into one Need |
| `packages/media-local/test/composite.test.ts` | 3/3 — synthetic alpha composite, real SAM mask, malformed Need rejected |
| Full suite | 1170 tests, 1146 pass, 0 fail, 24 skipped (the 6 new tests are inside that count; the real-mask one skips without `HYPIT_REAL_MASK`) |

The synthetic test is not a smoke test: it writes a 64×64, 10-frame green subject whose alpha is 255
on the left half and 0 on the right, composites it over an opaque red layer, decodes the output back
to RGBA and asserts, for frames 0, 5 and 9, that the left half is the subject (g > 180, r < 80) and
the right half is still the under layer (r > 180, g < 80), at alpha 255, with the frame count intact.

The real-mask test (`HYPIT_REAL_MASK=…/out-person.webm`, produced earlier by the SAM 3.1 cutout run)
composites that mask over a flat blue layer and measures the covered fraction at frame 25:
**0.2 < covered < 0.6**, consistent with the 0.3747 coverage the SAM run itself reported.

## Defects found and fixed during the build

1. **ffmpeg's native VP9 decoder silently drops the alpha stream.** The first composite drew the
   subject over the whole frame. `ffprobe` reports `pix_fmt=yuv420p` plus `alpha_mode=1`, so nothing
   looks wrong until pixels are measured. The executor now probes the subject's codec and adds
   `-c:v libvpx-vp9` before that input when it is VP9; ProRes 4444 keeps ffmpeg's default decoder.
2. **`geq=a=` alpha filters get flattened to yuv420p** when generating a VP9 test fixture, which hid
   the same bug twice. The fixture now writes raw RGBA frames directly, so the alpha plane is exactly
   what the assertions read.

Both are recorded because they are the failure modes anyone else will hit first: an alpha composite
that looks plausible and is measured wrong.

## Limits

- Audio is not carried through the composite; a captioned bed with sound needs a later mux.
- No colour-management conversion: both operands are assumed to share a colour space.
- The subject is scaled to the under layer's size with bicubic sampling; no fit/crop policy, no
  per-object offset yet.
- Not exercised through a full Build/executor run with a real ResourceStore — verification is at the
  capability, graph and executor layers, which is where the behaviour lives.
- The `composition` present-level `subjectId`/`z` hook was **not** wired in this pass: the composite is
  a media-level operation an author places explicitly. Wiring it into Present ordering is the next
  step, and it is the step that makes caption occlusion automatic rather than authored.
