# Fonts and independent text

Read this when choosing exact fonts, handling multiple writing systems or Emoji, or placing titles
and labels. [Caption](../playbooks/craft/captions.md) covers text displayed with speech.

The font's glyph shapes and spacing determine how text wraps and how much room it needs. A font
resource supplies those glyphs, a Style supplies their size and treatment, and a text item supplies
the wording, placement and lifetime. Changing one of these can preserve the others.

## Select a face or a fallback stack

```svml
<import as="fonts" from="@hypit/fonts-open@1"/>

<fonts:Face id="headline-font" family="archivo-black" weight="400" style="normal"/>
<fonts:Stack id="body-font" family="inter" weight="700" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-sc" weight="700" style="normal"/>
</fonts:Stack>
```

The Face is one exact font resource. Stack preserves an ordered set: here Inter, Noto Sans SC,
then a color Emoji face. Choose fallback faces for the actual writing systems in the video.
Weight and style must exist in the chosen family. `hypit vocabulary @hypit/fonts-open` and that
package's README describe the installed catalog and supported combinations.

Font bytes are explicit production resources, so rendering uses the selected faces regardless of
the machine's installed fonts. A supplied brand font can be declared with its exact face metadata:

```svml
<import as="asset" from="@hypit/media@1"/>
<asset:Font id="brand-font" src="./assets/brand-semibold.woff2" weight="600" style="normal"/>
```

Pass `{brand-font}` to the receiving Style. The file and metadata describe the actual supplied face.

`emoji="color"` adds a color face; `emoji="mono"` chooses monochrome. Some symbols have both text
and Emoji presentation. Write the intended Unicode sequence, such as `☎️`, when its color form is
wanted.

## Give independent text its own placement and lifetime

Typography is useful for titles, labels, verdicts and copy that follows its own display rhythm.
Script Caption remains appropriate when the displayed wording follows the performance.

The following excerpt assumes the named Fonts, layout Frames, SemanticTrack and Recipes exist:

```svml
<import as="copy" from="@hypit/text@1"/>
<import as="typo" from="@hypit/typography-track@1"/>

<typo:Style id="headline-style" recipe={look.text.title} font={headline-font}>
  <typo:Fill color="#F1E7D8"/>
</typo:Style>
<copy:Value id="headline">A useful idea, clearly shown.</copy:Value>
<typo:Track id="titles" semantic={speech.semantic}>
  <typo:Area id="opening-title" content={headline} placement={title-frame}
    style={headline-style} during={story.selection.proof}/>
</typo:Track>
```

Include `titles.track` in Film. The Style supplies typography, Paint and layer order; the item
supplies content, placement and time. Use `during="program"` for a title that lasts throughout the
program, or the component's declared Window forms for a shorter appearance.

For the example above, `look.text.title` can be the Recipe
`text.title { size: 54; weight: 400; stack-order: 20; }`, matching the selected headline face.

| Placement | Input and use |
| --- | --- |
| Point | A SpatialPoint anchoring text whose box follows its content |
| Area | A SpatialFrame for wrapping and fitting text in a bounded region |
| Path | A SpatialPath for text following an authored curve |

Query `hypit vocabulary @hypit/typography-track --tag Style` for the Recipe properties and
`--tag Track` for placement, content and motion forms. [Spatial layout](spatial.md) explains the
geometry these inputs carry.

## Rich text and motion

An item can take graph Text through `content={...}`, or own an inline document with `typo:P`,
`typo:Span` and `typo:Break`. For example, inside an Area:

```svml
<typo:P>Made for <typo:Span style={accent-style}>this moment</typo:Span>.</typo:P>
```

A paragraph or Span Style replaces that run's complete typography and Paint, including its font
and size. The outer item continues to supply placement and layer order.

Typography Motion can act on the item or stagger words and graphemes. Use the installed Motion
vocabulary for its frame offsets and normalized sequence positions. For a new speech-text layout
or scheduling relationship, [Caption authoring](caption-authoring.md) explains creating a family
that consumes the existing Caption document and semantic timing.
