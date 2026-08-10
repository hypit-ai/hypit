# Talking-head format

- Put a strong hook in the first Script Segment. Divide the script into semantic beats, usually 3–4
  segments, each planned for 4–15 seconds with an 8–12 second target.
- Keep one visual identity across A-roll: same face reference, room, wardrobe, and lighting. Use
  B-roll for changes, not to drift the presenter base.
- Use `seedance:ReferenceVideo` for face/image/audio references; use `seedance:TextVideo` without an
  identity reference. Keep dialogue and action as separate `text:Value` inputs.
- Build one `speech:Spine` and one `whisperx:Alignment`. Add `caption:Program` +
  `caption-fine:Track` only when requested; add B-roll through `media-track:Track` and editorial
  titles through `text:Track`.
- Review A-roll and B-roll independently, then validate the joined Film. Reuse accepted shots
  explicitly in a later Run Source.
