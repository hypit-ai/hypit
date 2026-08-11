# Silent visual mixcut format

- Render each generated beat through the vendored `broll-v1` Kit. Reuse an SVS Recipe for the shared
  material/edit/camera language and vary only the beat-specific `story` Text when appropriate.
- Each beat is a reference frame plus a silent generated motion clip. Keep clips 4–15 seconds, use
  distinct roles (hook, rhythm, detail/effect, conversion/payoff), and assemble ordered
  `media-track:Item` inputs deliberately.
- Without speech, use explicit `start`/`end` values in the shared `ProgramSpace` for titles, benefits,
  and CTA. Lock effective duration before laying out overlays; changing a clip duration requires
  updating those authored times.
- Make the first three seconds immediately engaging. Music or voiceover is the only audio source when
  generated clips are silent; truncate deliberately rather than letting a long track drift.
- Keep at most one or two text groups on screen at once. Product claims must match verified facts and
  the visible frame. Alpha graphics retain transparency and point to the intended CTA.
- Omit caption components when there is no spoken base; use `text:Track` for editorial copy.
