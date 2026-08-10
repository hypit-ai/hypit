# Overlay craft

- Base and overlays are complementary. Base prompts ignore captions, stickers, arrows, cards, UI,
  logos, and transition graphics; overlay analysis ignores the photographed base.
- Preserve every distinct changing or scrolling text segment. Put editable text in `text:Value`
  inputs and `text:Track`/`text:Area` content, not hard-coded generated segments.
- Infer alignment across frames: left, center, or right anchoring is a continuity decision. Keep text
  inside safe zones and away from faces, products, and key UI.
- Classify non-text layers by source: `real` photographed PIP/B-roll may be generated; `provided`
  screenshots, UI, charts, finished graphics, logos, and alpha stickers require supplied media.
- Prefer semantic timing through a Script `Selection` or `Moment` resolved by the WhisperX
  `SemanticMap`: use `during={story.selection.<id>}` for a range or `at={story.moment.<id>}` with
  an explicit `for` duration for a point. Without speech timing, use `during="program"` or explicit
  author-time `start`/`end` values in the shared `ProgramSpace`; never infer a window from a source
  video's original timestamps.
- Report unsupported effects with a reason. Build an approximation only when the gap stays attached
  to the authored element; never silently downgrade.
