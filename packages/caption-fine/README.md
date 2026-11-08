# `@hypit/caption-fine`

Fine flowing Caption for ordinary NLE projects.

Each materialized Cue is one normal Component Item containing complete display Words and exact
Item-local Unit time. Fine owns typography, outline and shadow paint, Cue and active-word boxes,
word-attribute faces, explicit structural rows, language-aware flow, shrink/ellipsis policy, Cue and
Unit motion, and current/trailing step or wipe Karaoke. Placement and lifetime remain direct NLE Item
facts.

This package carries the old Fine Caption's core visible relationship into the direct NLE boundary:
one stable Cue layout with Unit-timed glyph activation. It now lowers through the shared renderer-local
HTML Text terminal, so exact project font bytes, environment fallbacks, ordered shadow/outside-stroke/
fill Paint, word-attribute faces and authored separators use the same closure as other text components.
Karaoke may use a complete Active Paint—fill or gradient, outline, shadow, glow and long shadow. A
plain `activeColor` remains the concise Style for fill-only Karaoke; inactive words restore their
authored Base Paint exactly.

The current implementation restores the former family's underline, joined multi-line box measurement,
structural row limits, explicit shrink/ellipsis policy and motion vocabulary. Path text remains a
generic Fine Text placement concern rather than a second Caption timing model.

It deliberately does not restore the former authoring architecture. It owns no Script declarations,
semantic Timeline, tracking lookup, Recipe language, Studio companion or upstream alignment.
`@hypit/caption-nle` performs common one-way materialization; Fine contributes its component symbol,
persisted parameters and terminal implementation. Further visual capability belongs behind that same
NLE contract rather than rebuilding the removed live dependency chain.

The former implementation should not be mined only for Caption-specific CSS. Its reusable terminal
work included exact font loading, CJK-aware text flow, ordered glyph Paint, outline overflow,
joined multi-line boxes, shrink measurement and per-word/per-grapheme motion; Text Fine and other
components used the same visual vocabulary. Restoring those capabilities therefore means adapting
the renderer-local text/layout implementation to package-owned `HtmlVisual` programs, then letting
Fine supply Caption grouping, Unit timing and Karaoke behavior. It does not mean restoring
Composition tracks or semantic Timeline ownership.
