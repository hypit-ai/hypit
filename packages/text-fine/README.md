# `@hypit/text-fine`

This package is the fine-text family for independently authored titles, labels and short editorial
copy. Its preferred author declarations are occurrences rather than an aggregate text Track:

- `Flow` flows one document inside a SpatialFrame;
- `Point` hangs one document from a SpatialPoint;
- `Path` sets one document along a SpatialPath.

The package owns the declaration grammar and lowering for Style, Motion, PathMotion, Flow, Point,
Path, Mask and their nested rich-text and Paint structures. Markup only supplies their spelling.
Other authoring frontends can invoke the same declarations without reproducing typography parsing,
mixed-content ordering, placement policy or graph assembly.

Each occurrence requires an explicit Timeline and absolute Window, publishes its package-owned
`.occurrence` for Studio and sibling text tools, and publishes `.visual` for Film. It does not own a
Timeline, Narrative or semantic projection. A semantic, beat or other upstream domain can project
its evidence into an ordinary Window and pass that Window through `during`.

```svml
<import as="copy" from="@hypit/text@1"/>
<import as="typo" from="@hypit/text-fine@1"/>

<copy:Value id="headline-copy">A useful idea, clearly shown.</copy:Value>

<typo:Flow id="headline" timeline={film.timeline} within={layout.headline}
  style={title-style} align="center" block-align="center"
  during={story-hook} content={headline-copy}/>

<typo:Point id="chapter" timeline={film.timeline} point={layout.chapter}
  style={label-style} anchor-inline="start"
  during={chapter-window}>CHAPTER ONE</typo:Point>

<typo:Path id="orbit" timeline={film.timeline} path={layout.orbit}
  style={orbit-style} motion={orbit-motion}
  during={orbit-window}>
  FOLLOW THE CURVE
</typo:Path>
```

`during` accepts a resolved absolute Window, including the complete `film.window`. Declare direct
clock ranges through Timeline authoring before passing them here. These declarations have no `semantic`, `selection`,
`segment` or `moment` attribute: semantic time is one possible producer of a Window, not a special
capability every visual component must carry.

For words displayed as they are spoken, use a [Caption family](../caption-fine/README.md). Caption
Track remains useful because it aggregates a continuing CaptionDocument/CaptionTiming stream;
unrelated titles do not acquire that lifecycle merely because they are text.

The fine-text renderer supports rich documents, font stacks, Paint, wrapping, overflow and motion at
occurrence, word or grapheme level. Placement and time are separate from the Style Recipe. The
separate `typo:Mask` consumes one occurrence plus one owned still material and publishes `.visual`;
read its vocabulary for its deliberately bounded mask forms.

Flow, Point and Path are already geometry in the program picture plane; they are not pixel sources
and do not acquire a redundant `SpatialMap2D`. The Mask's still material is different: it has an
intrinsic local pixel plane, so its `contain`, `cover` or `fill` convenience resolves through the
shared Spatial mapping algebra before the material is cut by the glyphs. Typography therefore reuses
source mapping only where a real source plane exists.

Content has two explicit author forms:

```svml
<import as="copy" from="@hypit/text@1"/>
<import as="typo" from="@hypit/text-fine@1"/>

<copy:Value id="headline-copy">A useful idea, clearly shown.</copy:Value>

<typo:Flow id="headline" timeline={film.timeline} content={headline-copy}
  within={layout.headline} style={title-style} during={film.window}/>

<typo:Flow id="editorial" timeline={film.timeline} within={layout.editorial}
  style={body-style} during={film.window}>
  <typo:P>Rich <typo:Span style={accent}>authored</typo:Span> typography.</typo:P>
</typo:Flow>
```

`content={...}` consumes an ordinary graph `Text` and is exclusive with body content. It becomes
one plain document run; the occurrence still owns placement, timing, appearance and motion. Inline body
content owns a bounded rich `VisualTextDocument`. Dynamic rich text is intentionally not smuggled
through generic `Text`; it would require a separate explicit rich-document contract.

`<typo:P>`, `<typo:Span>` and `<typo:Break>` are declared children of every occurrence, so they are
discoverable from the package-owned declaration grammar rather than from prose. A `style` on a `<typo:P>` or a
`<typo:Span>` replaces the whole typography record, not only the paints: that paragraph or run is
shaped with the referenced Style's own exact font at its own size, weight and slant, so one document
can mix typefaces. Geometry and form-specific layout are direct occurrence attributes and never enter
the reusable Style. Whole-film placement belongs to the parent `<film:Track id="...">`, so a paragraph
or run cannot accidentally move or restack its occurrence.

There is no aggregate Typography Track or Typography-owned collection Program. Several independent
occurrences remain several explicit `.visual` contributions; a coordinated text-led visual role is
one project component rather than an accidental collection of unrelated strings.

The package also publishes `@hypit/text-fine/studio`. That subpath describes the same Flow, Point and
Path surfaces to Studio; it is part of this rendering family's release rather than a separately
versioned companion package.
