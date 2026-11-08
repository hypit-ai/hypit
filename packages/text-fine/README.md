# @hypit/text-fine

Rich titles, labels and editorial copy as ordinary materialized NLE Component Items.

The package owns rich text nodes, exact fonts, ordered paint and local Flow, Point or Path layout.
Path layout keeps rich HTML paint and places measured runs along authored line, quadratic or cubic
geometry; optional start-margin keyframes are Component-local rendering values. The NLE owns duration,
canvas placement, paint order and outer Effects. Whole-item motion therefore composes through
`@hypit/picture-transform`. Package-local Sequences can animate selected Text nodes by node, Unicode
word or grapheme with direct frame offsets and keyframes; Path and Sequence transforms compose rather
than overwrite each other. The package does not introduce a text track, named time, anchor lookup or
another timeline.
