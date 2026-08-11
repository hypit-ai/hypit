# Mass-tarot pick-a-card format

Evidence level: thin.

- Use the vendored `broll-v1` Kit for card/table motion. Keep shared material, story shape, camera,
  edit, and motion policy in a Recipe; connect each reveal action through the `story` slot.
- Preserve the four-part structure: question → three face-down cards → pick 1/2/3 prompt → individual
  reveals and interpretations.
- Frame interpretation as reflection, not guaranteed fortune-telling. Offer themes/directions, not
  exact dates, flat verdicts, or promised outcomes. Personality questions describe traits, not a
  predicted person's physical appearance.
- Generate silent card/table motion with `seedance:ReferenceVideo`; author narration and all editorial
  text separately. Numbers, questions, and interpretation lines belong in `text:Track` or the
  `caption:Program` + `caption-fine:Track` pair unless physically printed
  on supplied card art.
- Use real supplied card faces when exact symbolism matters. Keep card order and identity stable from
  selection through reveal.
- Validate every claim and visual cue with the project reviewer before production; do not fabricate certainty.
