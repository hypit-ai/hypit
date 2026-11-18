# Fine Text

`@hypit/text-fine` supplies the `fine` Picture component. Install and select it in the Project, and select its `text`
catalog offering to add a Fine Text Item from Studio’s Text bin. SVML Items reference `@hypit/text-fine#fine`.

The component parameters contain a rich text tree of stable text runs, groups and explicit line breaks, plus default
typography and ordered paints. Runs and groups can override styling. Studio exposes the text runs and the authored
font sources, size, weight, line height, spacing and solid fill. The Item’s Picture layout places the whole component.

`typography.fonts` lists font sources in fallback order. Use an installed Fontsource package, a project-relative
font file, or a system family. For example, `["@fontsource-variable/montserrat", "sans-serif"]` selects the project's
installed Montserrat with a system sans-serif fallback. Edit each existing source in the Inspector’s Font stack.
[Font source formats](../nle-delivery/README.md#text-fonts)

- `flow` places content inside the Item rectangle with padding, alignment, wrapping, columns and optional background.
- `point` places a text block at a local point with horizontal and vertical anchors.
- `path` lays runs along a local path defined by line and Bézier commands. Its start margin can be animated.

Static text is constant across the Item window. Authors can add sequences that animate runs, words or graphemes.
Sequences and path keyframes use the source frame rate declared by `motionRate`, with the Item’s source-time map
selecting the position to play. Trimming and splitting preserve the visible source positions.

The [Jensen ranking title](../../examples/ranking-jensen/film.svml) shows two centered text runs on a colored panel.
The [parameter types](src/types.ts) define the placement and animation values.
