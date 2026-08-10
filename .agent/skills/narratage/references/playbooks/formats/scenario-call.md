# Scenario-call format

This is an editorial recipe, not a native call generator. Use two `seedance:ReferenceVideo` outputs
or supplied video assets, then compose main/inset views with `media-track:Track` and explicit Frames.

Evidence level: thin.

- Prepare two final call-layout references: A main with B inset, and B main with A inset. Their main/
  inset geometry, rooms, wardrobe, and identities must be mutually consistent reverse states.
- Author explicit A/B Script cues and two clean voice references. Only the active speaker moves their
  mouth; the listener remains alive in either main or inset view.
- Keep both video feeds active. Do not let the inset become a frozen portrait unless that is explicitly
  the story state.
- Use at most one `caption:Program` + `caption-fine:Track`. Put call labels, notifications, and
  editorial copy in explicit `text:Track`/`media-track:Track`; Seedance must not generate them.
- Validate layout, speaker/voice assignment, reaction timing, and continuity with provider-free/mock
  media before a paid call generation.
