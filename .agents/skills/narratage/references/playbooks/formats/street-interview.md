# Street-interview format

Use the vendored data-only `street-interview-v1` Kit; it is a reusable Text Template, not a new
execution node. Render it with `text:Render` plus an SVS Recipe, then feed the result to one
`seedance:ReferenceVideo` with one complete-scene image and two ordered voice references. Use a
shared `speech:Spine` for take assembly and `media-track:Track` only for separate editorial overlays.

- Establish one shared scene reference showing interviewer, guest, microphone, distance, and street
  context. Establish two short clean voice references and a Script with explicit speaker cues.
- Use `A:` for the interviewer/first audio reference and `B:` for the guest/second audio reference.
  Connect dialogue and optional take-specific action through the Kit slots instead of rebuilding its
  role, microphone, scene, and no-overlay prompt blocks.
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
