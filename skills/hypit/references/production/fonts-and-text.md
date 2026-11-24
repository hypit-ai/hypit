# Fonts and Independent Text (`fonts-and-text.md`)

Read this when choosing fonts, loading local font files, handling multilingual text or Emoji, or placing titles and labels with `@hypit/text-fine`. [Caption Craft](../playbooks/craft/captions.md) covers speech-synced caption design and Chinese/English reading rhythm.

## Using `@hypit/text-fine` for Titles and Rich Text

`@hypit/text-fine` is the built-in NLE rich-text component (`package="@hypit/text-fine"`, `symbol="fine"`). Place it on a `<track kind="picture" role="text">`:

```xml
<track id="titles" name="Titles" kind="picture" role="text" enabled="true">
  <present id="opening-title" name="Opening Title" source="component" start="0/1" duration="3/1" enabled="true">
    <component package="@hypit/text-fine" symbol="fine"/>
    <parameters>{
      "typography": {
        "fonts": ["Inter", "Noto Sans SC", "sans-serif"],
        "fontSizePx": 68,
        "fontWeight": 700,
        "lineHeight": 1.15,
        "letterSpacingPx": -0.5,
        "wordSpacingPx": 0
      },
      "paints": [
        { "kind": "fill", "paint": { "kind": "solid", "color": "#F5F1E8" } }
      ],
      "children": [
        { "kind": "text", "id": "headline", "text": "Every frame counts." }
      ],
      "placement": {
        "kind": "flow",
        "paddingPx": { "top": 24, "right": 48, "bottom": 24, "left": 48 },
        "inlineAlign": "center",
        "blockAlign": "center",
        "wrap": "word",
        "overflow": "visible",
        "columns": 1,
        "columnGapPx": 0
      }
    }</parameters>
    <source-time>
      <linear target-start="0/1" target-end="3/1" source-start="0/1" rate="1/1" />
    </source-time>
    <picture>
      <layout x="90" y="240" width="900" height="220" fit="fill" />
    </picture>
  </present>
</track>
```

`@hypit/text-fine` integrates with NLE Studio's Inspector: text runs, font size, weight, line height, letter/word spacing, fill color, and font stacks can all be edited directly in Studio without rewriting SVML by hand.

## Choosing Font Stacks and Local Font Files

A font's glyph metrics determine line wrapping, visual weight, and legibility at delivery size:

- **Explicit fallback stacks**: order `typography.fonts` deliberately. Placing a Latin face first (`["Inter", "Noto Sans SC", "sans-serif"]`) gives Latin text Inter's proportions while falling back to Noto Sans SC for Chinese characters. Placing a CJK face first gives unified stroke weight across mixed-script lines.
- **Portable project fonts**: when using a brand font or non-system typeface, copy the standalone `.woff2`, `.ttf`, or `.otf` file into `assets/fonts/` inside the project and reference it explicitly so renders look identical across macOS, Windows, and Linux.
- **Real weights only**: match `fontWeight` to weights actually present in the font family or file to avoid blurry synthetic bolding.
- **CJK typography**: inspect actual Chinese, Japanese, or Korean wording at delivery resolution—including full-width punctuation, numbers, and embedded Latin brand names. English font sizes and tracking values rarely transfer unchanged to dense Han characters.

## Emoji Presentation

If a title or caption includes Emoji, include an explicit Emoji font in the stack (or use an authored SVG/PNG icon via `<media-input>` when cross-platform visual consistency matters). Use the explicit Emoji Unicode sequence (with variation selector where needed, e.g., `☎️`) when Emoji presentation is intended instead of monochrome text glyphs.

## Rich Text Runs and Placement

Inside `children`, `@hypit/text-fine` supports nested `group`, `text`, and `break` nodes so individual phrases can carry accent colors, weights, or line breaks while sharing one outer `<layout>` frame. Keep independent titles, callouts, and labels on `role="text"` tracks, and keep speech-synced subtitles on `role="subtitle"` tracks ([Caption Presentation](caption-presentation.md)).
