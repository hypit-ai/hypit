# Street-interview format

This is an editorial recipe, not a dedicated Narratage generation component. Compose it with a
`seedance:ReferenceVideo` per authored take (or supplied takes), explicit image/audio references,
and a shared `speech:Spine`; use `media-track:Track` for PIP/reaction layout.

- Establish one shared scene reference showing interviewer, guest, microphone, distance, and street
  context. Establish two short clean voice references and a Script with explicit speaker cues.
- Keep one locked or softly handheld two-person view. Drift may be slight, but do not cut to a new
  angle or reconstruct the room. The active speaker is identified by mouth and microphone; the listener
  remains visibly alive and silent.
- Add about one second of silent surprise before the first authored line in the opening shot. This is
  performance only; never add words to the Script.
- Define reverse-view backgrounds explicitly for reaction/device shots. Keep distinctive props stable
  across the reference image and motion prompt.
- Use one `caption:Program` + `caption-fine:Track` when captions are wanted. Put editorial overlays
  on a Script `Selection`/`Moment` resolved through the WhisperX `SemanticMap`; do not recreate the
  old phrase-query or source-timestamp locator model.
