# Reference video VLM to SVML

Write `main.svml`, optional `studio.svs`, and `build.svrun` directly. Do not persist storyboard/
overlay JSON or introduce a JSON-to-SVML conversion step.

- Write all VLM instructions and generated image/video prompts in English. Preserve original language
  only for verbatim dialogue/transcript/sample lines.
- Analyze active video clips, not stills alone. Split on RGB content distance, keep clips at or below
  15 seconds, and share one reference across continuous parts.
- Keep photographed base and editorial overlays complementary. Treat exact UI/screenshots/charts as
  provided media; generated live-action PIP/B-roll may be real generated media.
- Anchor recurring people/products/locations at the clearest shot and reuse references topologically.
- Listen to audio for voice design. Transcribe speech, not burned-in captions.
- Map transcript to Script; generated media to `seedance:TextVideo`/`FrameVideo`/`ReferenceVideo`;
  supplied assets to `media:Image`/`media:Audio` or `media-track:Item`; timing to `speech:Spine` and
  `whisperx:Alignment`; overlays to `caption:Program` + `caption-fine:Track`, `media-track:Track`,
  and `text:Track`; then `film:Film`/`render:Video` and a final-video Run Target.

Generated image prompt structure: English realistic-iPhone reality contract, detailed subject/story,
camera/reference relationship, then `Natural lighting, detailed realistic skin texture, and no visual artifacts.`

Every generated motion prompt ends with:

`Do not add subtitles or any on-screen text. Do not add stickers, labels, captions, floating words, or other graphic overlays. Preserve text that is physically printed on the product, device, or screen as part of the filmed content.`
