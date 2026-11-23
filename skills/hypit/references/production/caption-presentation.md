# Caption Presentation (`caption-presentation.md`)

Read this to place, style, vary, or hide subtitles across a timeline. [Caption Craft](../playbooks/craft/captions.md) owns visual direction and reading rhythm; [Timed Transcripts](script-syntax.md) owns aligning script wording to audio; [Caption Authoring](caption-authoring.md) owns building a custom caption component package.

## Placing Subtitles on a Subtitle Track

Subtitles live on `<track kind="picture" role="subtitle">` so they paint above picture and coverage tracks while remaining cleanly separated from independent titles (`role="text"`).

Using `@hypit/text-fine` (or a custom caption component) with TSX authoring ([TSX Authoring](authoring.md)), map each grouped cue from your aligned transcript (`hypit transcript align`) to a `<present>` with exact rational `start` and `duration`:

```xml
<track id="subtitles" name="Subtitles" kind="picture" role="subtitle" enabled="true">
  <present id="cue-1" name="Every frame counts." source="component" start="3/25" duration="43/25" enabled="true">
    <component package="@hypit/text-fine" symbol="fine"/>
    <parameters>{
      "typography": {
        "fonts": ["Inter", "Noto Sans SC", "sans-serif"],
        "fontSizePx": 52,
        "fontWeight": 700,
        "lineHeight": 1.2,
        "letterSpacingPx": 0,
        "wordSpacingPx": 0
      },
      "paints": [
        { "kind": "fill", "paint": { "kind": "solid", "color": "#FFFFFF" } }
      ],
      "children": [
        { "kind": "text", "id": "w1", "text": "Every " },
        { "kind": "text", "id": "w2", "text": "frame counts." }
      ],
      "placement": {
        "kind": "flow",
        "paddingPx": { "top": 12, "right": 24, "bottom": 12, "left": 24 },
        "inlineAlign": "center",
        "blockAlign": "end",
        "wrap": "word",
        "overflow": "visible",
        "columns": 1,
        "columnGapPx": 0
      }
    }</parameters>
    <source-time>
      <linear target-start="0/1" target-end="43/25" source-start="0/1" rate="1/1" />
    </source-time>
    <picture>
      <layout x="80" y="1380" width="920" height="220" fit="fill" />
    </picture>
  </present>
</track>
```

## Styling Across Passages and Speakers

- **Base look**: share one typography and layout helper across cues in TSX (or a `<shared-value>` in SVML) so font stack, size, safe-zone padding, and contrast treatment stay consistent across the entire piece.
- **Speaker differentiation**: vary fill color, subtle vertical offset, or speaker badge per speaker turn when two people talk on screen.
- **Emphasis passages**: swap the paint or scale for a key punchline cue, or use a custom kinetic caption component ([Caption Authoring](caption-authoring.md)) for word-by-word karaoke highlighting.
- **Hiding captions intentionally**: omit cues during dense on-screen demonstrations, title cards, or visual gags where subtitles would compete with the frame, or toggle `enabled="false"` on specific Presents.

## Inspecting Readability in Context

Always judge captions inside the live composition in NLE Studio (`hypit nle open`), never against a blank background:

- Check face clearance, UI chrome, and platform safe margins (bottom 20% and right edge on 9:16 vertical video).
- Verify cue handoffs so consecutive cues never flicker or leave awkward one-word orphans.
- Confirm contrast over both bright and dark B-roll cuts (using subtle shadow, stroke, or translucent backing pill when needed).
