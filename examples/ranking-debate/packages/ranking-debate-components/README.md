# Ranking debate components

Project-owned visual behavior for the ranking debate example.

- `ranking-board` owns persistent tier rows, a full-canvas presentation Stage, direct/drop entry
  motion into board Cells, text or exact-picture entry visuals, and locally timed reveals. Its
  ordinary NLE authoring facet can retitle the board or directly retime/reclassify an Entry.
- `verdict-burst` owns the final verdict's fixed visual treatment and entrance.

Both consume direct NLE Item parameters. They have no Script, transcript, semantic-anchor, Provider,
Build or media-origin dependency.
