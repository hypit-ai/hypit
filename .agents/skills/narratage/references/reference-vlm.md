# Reference video VLM to SVML

Write `main.svml`, optional `studio.svs`, and `build.svrun` directly.

- Write all VLM instructions and generated image/video prompts in English. Preserve original language
  only for verbatim dialogue/transcript/sample lines.
- Analyze active video clips, not stills alone. Split on RGB content distance, keep clips at or below
  15 seconds, and share one reference across continuous parts.
- Keep photographed base and editorial overlays complementary. Treat exact UI/screenshots/charts as
  provided media; generated live-action PIP/B-roll may be real generated media.
- Anchor recurring people/products/locations at the clearest shot and reuse references topologically.
- Listen to audio for voice design. Transcribe speech, not burned-in captions.
- Before hand-writing a Seedance prompt, select an official vendored Kit when the format matches:
  `speaker-v1`, `broll-v1`, `podcast-v1`, `call-v1`, `street-interview-v1`,
  `motion-reference-v1`, or `camera-reference-v1`. Supply only Recipe axes and dynamic slots.
- Author the transcript as Script; keep reusable prompt copy in `copy:Value`/`copy:Render`; generate
  media with `seedance:TextVideo`, `seedance:FrameVideo`, or `seedance:ReferenceVideo`; declare
  supplied assets with `media:Image`/`media:Audio` or place them with `media-track:Item`; establish
  timing with `speech:Spine` and `whisperx:Alignment`; build captions with an exact font,
  `caption-fine:Style`, `caption:Program`, `caption-ai:Planner`, and `caption-fine:Track`; put
  editorial text on `typo:Track`; then assemble with `film:Film`, render with `render:Video`, and
  demand the desired outputs in `build.svrun`.
- Route every generated reference image through `playbooks/craft/production-gates.md`. Pin and reuse
  each accepted image or take in the next Build with `.svrun` `build-record` and `satisfy`.

Generated image prompt structure: an English reality contract matching the observed capture medium,
the exact visible subject/story, camera geometry, and the role of every reference. Keep lighting,
skin/material texture, focus, and photographic finish consistent with the reference format.

When no official Kit applies, include this hygiene block in a freeform motion prompt:

`Do not add subtitles or any on-screen text. Do not add stickers, labels, captions, floating words, or other graphic overlays. Preserve text that is physically printed on the product, device, or screen as part of the filmed content.`
