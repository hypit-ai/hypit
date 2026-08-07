---
title: SVS Stylesheets
description: The SVS Recipe language — CSS-like stylesheets for film, caption, B-roll, text and generation settings.
---

# SVS Stylesheets

SVS (`.svs`) files define reusable, typed configuration values using a CSS-like syntax. They
configure film dimensions, caption appearance, B-roll layout, text styling, speech estimation
parameters, generation settings, and custom fonts. SVS values are called **Recipes** — they are
immutable typed Records that consuming components validate and interpret.

## Basic syntax

```svs
<?svml using="@narratage/svs@1"?>

<sheet version="1" id="studio">
  film.vertical {
    width: 1080;
    height: 1920;
    frame-rate: 30;
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

Film appearance — canvas dimensions and background color.

```svs
film.vertical {
  width: 1080;
  height: 1920;
  frame-rate: 30;
  background: #09090B;
}
```

| Property | Description |
|---|---|
| `width` | Canvas width in pixels |
| `height` | Canvas height in pixels |
| `frame-rate` | Frames per second (typically 30) |
| `background` | Canvas clear color (hex) |

Referenced by `film:Film` via the `appearance` attribute:

```svml
<film:Film id="main" space={speech.space} appearance={studio.film.vertical}>
```

## Caption

Caption visual appearance — position, typography, and container styling.

```svs
caption.dialogue {
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
| `stack-order` | Z-stacking order among all Tracks (higher = on top) |
| `x`, `y` | Position as fraction of canvas (0–1) |
| `width` | Width as fraction of canvas |
| `font` | Font family name or SVS font reference |
| `weight` | Font weight (400–900) |
| `size` | Font size in pixels |
| `line-height` | Line height multiplier |
| `align` | Text alignment: `left`, `center`, `right` |
| `fill` | Text color (hex, supports alpha) |
| `background` | Container background color (hex, supports alpha like `#09090BCC`) |
| `padding` | Container padding in pixels (single value or `vertical horizontal`) |
| `radius` | Container border radius in pixels |

Referenced by `caption:Style` via the `appearance` attribute:

```svml
<caption:Style id="primary-caption" appearance={studio.caption.dialogue}>
```

### Per-role caption styles

Define multiple caption Recipes for different speakers:

```svs
caption.alice {
  stack-order: 70;
  x: 0.08; y: 0.76; width: 0.84;
  font: Inter; weight: 600; size: 58;
  fill: #73FBD3;
  background: #09090BCC;
  padding: 16 24; radius: 18;
}

caption.bob {
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
<caption:Program id="caption-program" narrative={story} default={studio.caption.dialogue}>
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

Text overlay appearance — position, typography.

```svs
text.title {
  stack-order: 90;
  x: 0.06;
  y: 0.06;
  width: 0.88;
  height: 0.10;
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
| `x`, `y` | Position as fraction of canvas |
| `width`, `height` | Size as fraction of canvas |
| `font` | Font family name |
| `weight` | Font weight |
| `size` | Font size in pixels |
| `align` | Text alignment |
| `fill` | Text color |
| `tracking` | Letter spacing adjustment |

Referenced by `text:Item` via the `appearance` attribute:

```svml
<text:Item text="MEANING" during="full" appearance={studio.text.title}/>
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

## Font declarations

Declare local font files for use in captions and text overlays.

```svs
font.inter-semibold {
  src: ./assets/Inter-SemiBold.woff2;
  weight: 600;
  style: normal;
}

font.inter-black {
  src: ./assets/Inter-Black.woff2;
  weight: 900;
  style: normal;
}
```

| Property | Description |
|---|---|
| `src` | Path to the font file (relative to the SVS file) |
| `weight` | Font weight this file provides |
| `style` | Font style: `normal`, `italic` |

Font paths are resolved at compile time and become `FontArtifactRef` values. Reference them by name
in other SVS blocks:

```svs
caption.dialogue {
  font: inter-semibold;
  /* ... */
}
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
    width: 720;
    height: 1280;
    frame-rate: 30;
    background: #09090B;
  }

  caption.primary {
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

<caption:Style id="primary-caption" appearance={studio.caption.primary} .../>

<film:Film id="main" space={speech.space} appearance={studio.film.vertical}>
```
