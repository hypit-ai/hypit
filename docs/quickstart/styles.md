---
title: SVS Stylesheets
description: The SVS Recipe language — CSS-like stylesheets for film, caption, B-roll, text and generation settings.
---

# SVS Stylesheets

SVS (`.svs`) files define reusable, typed configuration values using a CSS-like syntax. They
configure Film appearance, caption appearance, B-roll layout, text styling, speech estimation
parameters, generation settings, and typography choices. SVS values are called **Recipes** — they are
immutable typed Records that consuming components validate and interpret.

## Basic syntax

```svs
<?svml using="@narratage/svs@1"?>

<sheet version="1" id="studio">
  film.vertical {
    background: #09090B;
  }

  /* Comments use CSS-style block syntax. */
  caption.primary {
    fill: #FFFFFF;
    size: 58;
  }
</sheet>
```

- The processing instruction `<?svml using="@narratage/svs@1"?>` selects the SVS parser.
- The `<sheet>` element wraps all declarations. The `id` attribute becomes the top-level namespace.
- Each block is `namespace.name { ... }` with `;`-terminated key-value properties.
- Comments use `/* ... */`.

## Importing and referencing

Import an SVS file in your `.svml` source with a namespace prefix:

```svml
<import as="studio" source="./studio.svs"/>
```

Then reference individual Recipes via `{studio.film.vertical}`, `{studio.caption.primary}`, etc.
The prefix comes from the `as=` attribute; the path comes from `namespace.name` in the sheet.

## Film

Film appearance owns only the canvas clear color. Canvas dimensions are an explicit
`space:Canvas` graph value, while frame rate comes from ProgramSpace.

```svs
film.vertical {
  background: #09090B;
}
```

| Property | Description |
|---|---|
| `background` | Canvas clear color (hex) |

Referenced by `film:Film` via the `appearance` attribute:

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>
<film:Film id="main" canvas={vertical} space={speech.space} appearance={studio.film.vertical}>
```

## Caption Fine

The first official Caption Style family keeps planning and rendering parameters in one Recipe.

```svs
caption.dialogue {
  cue-min-words: 2;
  cue-max-words: 7;
  stack-order: 70;
  x: 0.08;
  y: 0.76;
  width: 0.84;
  font: Inter;
  weight: 600;
  size: 58;
  line-height: 0.96;
  align: center;
  fill: #FFFFFF;
  background: #09090BCC;
  padding: 16 24;
  radius: 18;
}
```

| Property | Description |
|---|---|
| `cue-min-words`, `cue-max-words` | Common Cue word-count bounds |
| `stack-order` | Z-stacking order among all Tracks (higher = on top) |
| `x`, `y` | Position as fraction of canvas (0–1) |
| `width` | Width as fraction of canvas |
| `font` | Readable font-family label and environment fallback |
| `weight` | Requested font weight (1–1000) |
| `size` | Font size in pixels |
| `line-height` | Line height multiplier |
| `align` | Text alignment: `left`, `center`, `right` |
| `fill` | Text color (hex, supports alpha) |
| `background` | Container background color (hex, supports alpha like `#09090BCC`) |
| `padding` | Container padding in pixels (single value or `vertical horizontal`) |
| `radius` | Container border radius in pixels |

For reproducible rendering, select an exact installed face in the `.svml` source and pass that
Record to the Fine Style. The primary face's `weight` and `style` must match the Recipe:

```svml
<fonts:Face id="caption-font" family="inter" weight="600" style="normal"/>
<caption-fine:Style id="primary-caption" recipe={studio.caption.dialogue}
  font={caption-font}/>
```

### Per-role caption styles

Define multiple caption Recipes for different speakers:

```svs
caption.alice {
  cue-min-words: 2; cue-max-words: 5;
  stack-order: 70;
  x: 0.08; y: 0.76; width: 0.84;
  font: Inter; weight: 600; size: 58;
  fill: #73FBD3;
  background: #09090BCC;
  padding: 16 24; radius: 18;
}

caption.bob {
  cue-min-words: 2; cue-max-words: 5;
  stack-order: 70;
  x: 0.08; y: 0.76; width: 0.84;
  font: Inter; weight: 600; size: 58;
  fill: #FFD166;
  background: #09090BCC;
  padding: 16 24; radius: 18;
}
```

Then assign them via `caption:Program`:

```svml
<caption-fine:Style id="default-caption" recipe={studio.caption.dialogue}/>
<caption-fine:Style id="alice-caption" recipe={studio.caption.alice}/>
<caption-fine:Style id="bob-caption" recipe={studio.caption.bob}/>
<caption:Program id="caption-program" display={story.caption} default={default-caption}>
  <caption:Use role="ALICE" style={alice-caption}/>
  <caption:Use role="BOB" style={bob-caption}/>
</caption:Program>
```

## B-roll

B-roll item appearance — position, fit, container, and enter/exit animations.

```svs
broll.product {
  stack-order: 40;
  x: 0.08;
  y: 0.20;
  width: 0.84;
  height: 0.48;
  fit: contain;
  background: #111116;
  radius: 28;
  enter: slide-up 8f;
  exit: fade 6f;
}
```

| Property | Description |
|---|---|
| `stack-order` | Z-stacking order |
| `x`, `y` | Position as fraction of canvas |
| `width`, `height` | Size as fraction of canvas |
| `fit` | How the source fits the container: `cover`, `contain` |
| `background` | Container background color |
| `radius` | Container border radius |
| `enter` | Enter animation: `slide-up Nf`, `fade Nf` (N = frames) |
| `exit` | Exit animation: `fade Nf`, `slide-down Nf` |

Referenced by `broll:Item` via the `appearance` attribute:

```svml
<broll:Item source={motion.video} during={story.selection.demo}
  appearance={studio.broll.product}/>
```

## Text

Text overlay appearance — typography and Paint. Placement is a separate `SpatialFrame` graph edge.

```svs
text.title {
  stack-order: 90;
  font: Inter;
  weight: 900;
  size: 64;
  align: center;
  fill: #FFFFFF;
  tracking: -1;
}
```

| Property | Description |
|---|---|
| `stack-order` | Z-stacking order |
| `font` | Font family name |
| `weight` | Font weight |
| `size` | Font size in pixels |
| `align` | Text alignment |
| `fill` | Text color |
| `tracking` | Letter spacing adjustment |

Referenced by `text:Item` via the `appearance` attribute:

```svml
<text:Item text="MEANING" during="full" frame={title-frame}
  appearance={studio.text.title}/>
```

## Speech estimation

Parameters for deterministic speech duration estimation.

```svs
speech.normal {
  language: en;
  pace: normal;
  padding: 0.3;
  min: 4;
  max: 15;
  rounding: ceil;
}
```

| Property | Description |
|---|---|
| `language` | Language code (e.g. `en`) |
| `pace` | Speaking pace: `slow`, `normal`, `fast` |
| `padding` | Extra padding in seconds added to the estimate |
| `min` | Minimum duration in seconds |
| `max` | Maximum duration in seconds |
| `rounding` | Rounding mode: `ceil`, `floor`, `round` |

Referenced by `estimate:Speech` via the `policy` attribute:

```svml
<estimate:Speech id="hook-duration" source={story.segment.hook.speech}
  policy={studio.speech.normal}/>
```

## Speaker

Seedance Speaker generation settings — the Recipe that controls how `speaker:Take` generates a
talking-head clip.

```svs
speaker.host {
  kind: ugc-talking-head;
  model: mini;
  resolution: 720p;
  aspect-ratio: 9:16;
  composition-stability: soft-locked;
  camera-motion: none;
  edit-rhythm: continuous-take;
  performance: natural-explainer;
  gesture: natural;
  voice-mode: single-speaker;
}
```

| Property | Description |
|---|---|
| `kind` | Generation kind (e.g. `ugc-talking-head`) |
| `model` | Model name: `mini` |
| `resolution` | Output resolution: `480p`, `720p`, `1080p` |
| `aspect-ratio` | Output aspect ratio: `9:16`, `16:9`, `1:1` |
| `composition-stability` | Camera/composition consistency: `flexible-ugc`, `soft-locked`, `strict-locked` |
| `camera-motion` | Camera movement: `none`, `subtle-punch-in-return` |
| `edit-rhythm` | Editing style: `continuous-take`, `pause-trim-jump-cuts` |
| `performance` | Acting style: `natural-explainer`, `high-energy-ugc`, `calm-authority`, `reactive-playful` |
| `gesture` | Gesture intensity: `restrained`, `compact`, `natural`, `expressive` |
| `voice-mode` | Voice configuration: `single-speaker` |

Referenced by `speaker:Take` via the `recipe` attribute:

```svml
<speaker:Take id="hook-take" dialogue={story.segment.hook.dialogue}
  duration={hook-duration.duration} recipe={studio.speaker.host} kit={ugc.official-ugc-v1}>
```

## Exact font declarations

SVS describes typography policy, but it does not choose or open font bytes. For common open fonts,
import the private pre-release catalog and select only the faces the Author Graph uses:

```svml
<import as="fonts" from="@narratage/fonts-open@1"/>

<fonts:Stack id="caption-fonts" family="inter" weight="600" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-sc" weight="600" style="normal"/>
</fonts:Stack>
```

| Property | Description |
|---|---|
| `family` | A family from the package's finite catalog |
| `weight` | Exact selected face weight |
| `style` | Selected style: `normal` or a family-supported `italic` |
| `emoji` | Optional `color` (COLRv1) or `mono` fallback on `Stack` |

The catalog contains 109 open families across handwriting, script, display, sans, serif,
monospace, CJK, world-script and Emoji categories. Fontsource dependencies are pinned to `5.3.0`;
the Chromium-compatible COLRv1 Emoji package is pinned separately. The compiler hashes installed
bytes into content-addressed font values. It performs no download during a build, and the Runtime
never guesses a font:

```svml
<caption-fine:Style id="dialogue" recipe={studio.caption.dialogue}
  font={caption-fonts}/>
```

`fonts:Stack` emits one generic `FontStackRef`: its primary must match the Recipe's weight/style and
its fallbacks preserve their own honest metadata. CJK and Emoji can be split into several
Unicode-range files while remaining one logical graph edge. Omitting the stack keeps the Recipe's `font` family as an environment fallback,
which is convenient for prototypes but is not byte-reproducible.
For a symbol with both text and Emoji presentation, write the authored Unicode Emoji sequence
(for example `☎️`, including VS16); no package rewrites display text to force color.

Brand and custom fonts remain explicit author assets rather than additions to the shared catalog:

```svml
<import as="media" from="@narratage/media@1"/>
<media:Font id="brand" src="./assets/Brand-Semibold.woff2"
  weight="600" style="normal"/>
```

## Combination example

A complete `studio.svs` file for a four-take talking-head project:

```svs
<?svml using="@narratage/svs@1"?>

<sheet version="1" id="studio">
  speech.normal {
    language: en;
    pace: normal;
    padding: 0.3;
    min: 4;
    max: 15;
    rounding: ceil;
  }

  speaker.host {
    kind: ugc-talking-head;
    model: mini;
    resolution: 720p;
    aspect-ratio: 9:16;
    composition-stability: soft-locked;
    camera-motion: none;
    edit-rhythm: continuous-take;
    performance: natural-explainer;
    gesture: natural;
    voice-mode: single-speaker;
  }

  film.vertical {
    background: #09090B;
  }

  caption.primary {
    cue-min-words: 2;
    cue-max-words: 5;
    stack-order: 70;
    x: 0.08;
    y: 0.74;
    width: 0.84;
    font: Inter;
    weight: 800;
    size: 44;
    line-height: 1;
    align: center;
    fill: #FFFFFF;
    background: #09090BCC;
    padding: 14 20;
    radius: 16;
  }
</sheet>
```

This file is imported once in the `.svml` source and its values are referenced throughout:

```svml
<import as="studio" source="./studio.svs"/>

<estimate:Speech id="hook-duration" source={story.segment.hook.speech}
  policy={studio.speech.normal}/>

<speaker:Take id="hook-take" ... recipe={studio.speaker.host} .../>

<caption-fine:Style id="primary-caption" recipe={studio.caption.primary}/>

<space:Canvas id="vertical" width="720" height="1280"/>
<film:Film id="main" canvas={vertical} space={speech.space} appearance={studio.film.vertical}>
```
