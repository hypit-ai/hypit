# `@hypit/typography-track`

Official provider-free Text overlay package. It owns a typed `TypographyTrackProgram` and lowers every
item into an independently timed and stacked Present in the public VisualTrack contract.

`TypographyTrackProgram@1` implements the complete Point/Area/Path author model:
bounded rich documents, exact font stacks, ordered Paint, frame/content/paragraph/line/run/word/
grapheme boxes, deterministic overflow and Unicode-aware local motion.

An item spanning the complete ProgramSpace is a persistent overlay; a shorter item is timed. They
are not different Track kinds. Timing is projected through `@hypit/temporal`, and placement is
an explicit `SpatialFrame` input from `@hypit/spatial`; neither is hidden in the appearance
Recipe. The package exposes semantic typography rather than a rendering callback, arbitrary CSS or
cross-Track access.

The provider-free `<text:Track>` Surface validates `.svs` Recipes, accepts Program, Selection,
Moment or explicit point-expression timing plus explicit Point/Frame/Path edges, and produces the
same TypographyTrackProgram without changing Core or Film. `<text:Mask>` is a separate component that
consumes one authored Text Program and one owned still Surface; advanced/multiline/Path masks fail
closed and materialize through an independent package.

Content has two explicit author forms:

```svml
<import as="copy" from="@hypit/text@1"/>
<import as="typo" from="@hypit/typography-track@1"/>

<copy:Value id="headline">Intent, not timelines.</copy:Value>

<typo:Track id="titles" space={speech.space}>
  <typo:Area id="headline" content={headline}
    placement={layout.headline} style={title-style} during="program"/>

  <typo:Area id="editorial" placement={layout.editorial}
    style={body-style} during="program">
    <typo:P>Rich <typo:Span style={accent}>authored</typo:Span> typography.</typo:P>
  </typo:Area>
</typo:Track>
```

`content={...}` consumes an ordinary graph `Text` and is exclusive with body content. It becomes
one plain document run; the Track still owns placement, timing, appearance and motion. Inline body
content owns a bounded rich `VisualTextDocument`. Dynamic rich text is intentionally not smuggled
through generic `Text`; it would require a separate explicit rich-document contract.

`<typo:P>`, `<typo:Span>` and `<typo:Break>` are declared children of every item, so they are
discoverable from the Surface vocabulary rather than from prose. A `style` on a `<typo:P>` or a
`<typo:Span>` replaces the whole typography record, not only the paints: that paragraph or run is
shaped with the referenced Style's own exact font at its own size, weight and slant, so one document
can mix typefaces. The Style's area, point, path and stacking-order properties are ignored there;
those stay with the item.
