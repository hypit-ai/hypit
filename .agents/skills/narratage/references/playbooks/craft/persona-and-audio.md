# Persona and audio craft

- Establish identity from a clear visual anchor and voice from real audio. Do not infer voice from
  appearance alone.
- Keep one stable persona per recurring speaker: face, age range, vocal texture, delivery, accent,
  pace, and emotional register. Preserve the original-language sample line verbatim.
- Keep reference audio short and clean; trim silence and unrelated voices. Respect provider/model
  reference-duration limits and inspect duration before planning.
- Choose the voice before finalizing shot timing when TTS is the sole source. One continuous voiceover
  can cover independently selected visual cuts; do not split TTS merely to mirror each shot.
- Keep speech, music, and effects as separate explicit `audio:Track` contributions made of
  `audio:Clip` items. Dialogue wins the mix.
