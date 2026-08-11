# Ranking-listicle format

Evidence level: partial.

- Use one official `ranking` variant (`TierBoard`, `Column`, `TopThree`, or `TypewriterList`) or one
  `deck:DepthStack` for all items; change layout/style through its Recipe or
  component configuration rather than duplicating competing tracks.
- Every item has a stable identity, label/icon, rank/tier, and narrow semantic evidence window. A
  non-contiguous Selection does not implicitly clone an item; author repeated appearances explicitly.
- Write each spoken item as setup → concrete evidence/cost → punchline. Higher-value entries should
  earn stronger evidence and a more decisive close, not merely a different color.
- Keep editable labels, scores, icons, and headings as graph inputs/assets. Verify item order, timing,
  visual hierarchy, and evidence before render.
- Claims must be supportable. Do not invent comparative facts, performance numbers, or user votes.
