# Scenario-call format

Use the vendored data-only `call-v1` Kit; it is a reusable Text Template, not a new execution node.
Render it with `text:Render` plus an SVS Recipe, then feed one `seedance:ReferenceVideo` with the two
final reversed call-layout images and two ordered voice references. Use supplied media and
`media-track:Track` only when the call must be assembled from independent real feeds.

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
