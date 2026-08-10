# `@narratage/typography-track`

Official provider-free Text overlay package. It owns a typed `TypographyTrackProgram` and lowers every
item into an independently timed and stacked Present in the public VisualTrack contract.

The current `TypographyTrackProgram@1` implements the complete pre-release Point/Area/Path author model:
bounded rich documents, exact font stacks, ordered Paint, frame/content/paragraph/line/run/word/
grapheme boxes, deterministic overflow and Unicode-aware local motion. Its author Surface remains
pre-release even though the repository-internal Track and Visual IR waist is now frozen.

An item spanning the complete ProgramSpace is a persistent overlay; a shorter item is timed. They
are not different Track kinds. Timing is projected through `@narratage/temporal`, and placement is
an explicit `SpatialFrame` input from `@narratage/spatial`; neither is hidden in the appearance
Recipe. The package exposes semantic typography rather than a rendering callback, arbitrary CSS or
cross-Track access.

The provider-free `<text:Track>` Surface validates `.svs` Recipes, accepts Program, Selection,
Moment or explicit point-expression timing plus explicit Point/Frame/Path edges, and produces the
same TypographyTrackProgram without changing Core or Film. `<text:Mask>` is a separate component that
consumes one authored Text Program and one owned still Surface; advanced/multiline/Path masks fail
closed and materialize through an independent package.

Content has two explicit author forms:

```svml
<import as="copy" from="@narratage/text@1"/>
<import as="typo" from="@narratage/typography-track@1"/>

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
