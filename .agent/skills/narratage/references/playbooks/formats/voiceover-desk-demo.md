# Voiceover desk-demo format

- Produce one continuous TTS/audio source for the narration. Plan its actual duration before selecting
  visual shot lengths; do not split TTS merely to mirror visual cuts.
- Keep every B-roll clip silent. Visual cuts follow visible screen/product changes, not sentence
  boundaries; one sentence may cross several shots.
- Place voiceover as an explicit `audio:Track` over independent `media-track:Track` visuals. Because
  the base is silent, bind clips with `during="program"` or explicit `start`/`end` in the shared
  `ProgramSpace`; use a `Selection`/`Moment` only when a measured speech base and `SemanticMap`
  exist. Do not use phrase-query, `full`, or manual-locator semantics from another authoring system.
- Treat UI, labels, receipts, and website text as provided physical screen content. Add editorial
  explanations as `text:Track`, never floating generator text.
