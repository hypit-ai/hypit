# Fonts and independent text

Read this when choosing or finding fonts, using a local font file, handling multiple writing systems
or Emoji, or placing titles and labels. [Caption](../playbooks/craft/captions.md) covers text displayed
with speech and the reading rhythm of Chinese and English Cues.

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

For Chinese-led speech, start with a face made for the intended script: the installed catalog
includes `noto-sans-sc` and `noto-serif-sc` for Simplified Chinese, `noto-sans-tc` and `noto-serif-tc`
for Traditional Chinese, and display faces such as `zcool-kuaile`. Choose their character to suit the
piece. A compact, clear face is useful for running speech; an expressive display face can suit a
playful caption or a short title. Inspect the real words at delivery size, including punctuation,
numbers and any Latin names.

Fallback order also directs the design. Inter first with Noto Sans SC after it gives Latin letters
Inter's shapes and Chinese Noto's. A Chinese face first can supply both scripts for a more unified
line. Similar numeric weights in different families can look different, so judge the pairing in the
same Cue. The renderer uses the exact supplied faces and disables synthetic bold and italic.

## Use fonts already on the machine or supplied by the user

Installed fonts are useful source material. Select their actual files and declare them as assets,
so the chosen face travels with the build instead of depending on a family name existing on another
machine. For example, a project can use a local brand face alongside an explicit Chinese fallback:

```svml
<import as="asset" from="@hypit/media@1"/>
<asset:Font id="brand-font" src="./assets/fonts/brand-semibold.woff2" weight="600" style="normal"/>
<fonts:Face id="chinese-font" family="noto-sans-sc" weight="600" style="normal"/>

<caption-fine:Style id="caption-style" recipe={look.caption.primary} font={brand-font}>
  <caption-fine:Fallback font={chinese-font}/>
</caption-fine:Style>
```

This excerpt assumes the `fonts`, `caption-fine` and Recipe imports. `asset:Font` accepts a file path;
copying a selected face into the project's `assets/fonts/` makes the Source portable. Use the file's
real weight and style. Declaring weight 700 does not turn a regular-only file into a bold face.

Useful places to locate fonts include Font Book and `~/Library/Fonts` or `/Library/Fonts` on macOS;
Windows Fonts and `%WINDIR%\Fonts` or `%LOCALAPPDATA%\Microsoft\Windows\Fonts` on Windows; and
`fc-list` on systems with Fontconfig. Search the relevant font locations or use the operating
system's font information to identify the face and file. A local `.ttf`, `.otf`, `.woff` or `.woff2`
face can enter the same asset path as a supplied font. A `.ttc`/`.otc` collection contains multiple
faces; the current Font Surface has no collection-face selector. Obtain the intended standalone
face, or export it with a font tool when permitted, before declaring it.

## Find a face when the available choices do not fit

Start with the user's brand assets and the relevant local or bundled faces. If the work calls for
another face, look at the foundry's or an open-font project's official specimen and download. Check
the actual script coverage, available weight/style and intended use, then bring the chosen file into
the project. Keep its source and license with it, especially when sharing the editable project.
Downloading a selected face as an asset is enough; installing it system-wide is optional.

Font choice and treatment work together: compare the actual caption wording, its line width,
character detail and contrast with the image. Good Han glyph coverage alone does not make an
English font-size, spacing or outline recipe suit Chinese text.

## Emoji presentation

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
