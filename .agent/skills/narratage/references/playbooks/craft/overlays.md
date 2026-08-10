# Overlay craft

- Base and overlays are complementary. Base prompts ignore captions, stickers, arrows, cards, UI,
  logos, and transition graphics; overlay analysis ignores the photographed base.
- Preserve every distinct changing or scrolling text segment. Put editable text in Text inputs and
  Typography Track content, not hard-coded generated segments.
- Infer alignment across frames: left, center, or right anchoring is a continuity decision. Keep text
  inside safe zones and away from faces, products, and key UI.
- Classify non-text layers by source: `real` photographed PIP/B-roll may be generated; `provided`
  screenshots, UI, charts, finished graphics, logos, and alpha stickers require supplied media.
- Prefer spoken-phrase timing using a literal contiguous transcript substring; do not anchor to the
  final sentence. Without speech, use a scene-relative fraction/manual window, never source-video
  absolute seconds.
- Report unsupported effects with a reason. Build an approximation only when the gap stays attached
  to the authored element; never silently downgrade.
