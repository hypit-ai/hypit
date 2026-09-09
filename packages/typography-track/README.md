# `@hypit/typography-track`

The Track Surface accepts `semantic={speech.semantic}` or `space={animation}`. Semantic context
resolves Script Selections and Moments; authored space supports clock-based animation. Shared `at`
inputs accept a Moment or a time such as `2s`; `at` with `for` produces a Window where required.

Place independently authored titles, labels, verdicts and other text in the video. Their lifetime
can follow a Script Selection or Moment even when their wording differs from the speech. For words
displayed as they are spoken, use a [Caption family](../caption-fine/README.md).

The Track takes `semantic` or `space` to supply ProgramSpace. Items use explicit Point, Frame or Path
placement, exact fonts and Styles. Timing can follow a Segment, Selection, Moment with duration, the
whole program or explicit clock expressions. `.program` describes the text presentation; `.track`
is the VisualTrack to include in Film. Each item has its own lifetime and stacking order.

The text program supports rich documents, font stacks, Paint, wrapping, overflow and motion at item,
word or grapheme level. Placement and time are separate from the Style Recipe. `typo:Mask` is a
separate component for an authored Text Program and an owned still surface; read its vocabulary for
the supported mask forms.

Content has two explicit author forms:

```svml
<import as="copy" from="@hypit/text@1"/>
<import as="typo" from="@hypit/typography-track@1"/>

<copy:Value id="headline-copy">A useful idea, clearly shown.</copy:Value>

<typo:Track id="titles" semantic={speech.semantic}>
  <typo:Area id="headline" content={headline-copy}
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
