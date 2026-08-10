# Production gates

- Freeze Script meaning, target language, format, aspect ratio, duration, and supplied assets before
  writing generation prompts.
- Build the shot list from story beats first. Every shot needs a job: hook, evidence, mechanism,
  payoff, transition, or CTA.
- Confirm keys, Runtime Profile, package locks, media limits, and model/resolution choices. Run
  `check` and `plan` before any paid Operation.
- Review reference images before video generation: reject identity drift, malformed hands, watermarks,
  unwanted text, and impossible camera relationships.
- Review each video shot independently: motion starts from the reference, stays in 4–15 seconds,
  preserves props/wardrobe/space, and contains no generated overlays.
- Review captions, typography, and media overlays on the real base program for safe zones, occlusion,
  phrase anchors, and stacking.
- Use mock/provider-free inputs to validate topology and timing. Do not mock the only audio source
  when acceptance depends on real speech or TTS.
- Regenerate only failed shots and reuse accepted Artifacts explicitly in a later Run Source; there
  is no implicit cache.
