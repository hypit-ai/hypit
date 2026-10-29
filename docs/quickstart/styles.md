---
title: SVS Stylesheets
description: The SVS Recipe language — CSS-like stylesheets for film, caption, media, text and generation settings.
---

SVS (`.svs`) files define reusable, typed configuration values using a CSS-like syntax. They
configure Film appearance, caption appearance, Media presentation and motion, text styling, generation settings, and typography choices. SVS values are called **Recipes** — they are
immutable typed Records that consuming components validate and interpret.

## Basic syntax

```svs
<?svml using="@hypit/recipe@1"?>

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

- The processing instruction `<?svml using="@hypit/recipe@1"?>` selects the SVS parser.
- The `<sheet>` element wraps all declarations. The `id` attribute becomes the top-level namespace.
- Each block is `namespace.name { ... }` with `;`-terminated key-value properties.
- Comments use `/* ... */`.

## Importing and referencing

Import an SVS file in your `.svml` source with a namespace prefix:

```svml
<import as="recipes" source="./recipes.svs"/>
```

Then reference individual Recipes via `{recipes.film.vertical}`, `{recipes.caption.primary}`, etc.
The prefix comes from the `as=` attribute; the path comes from `namespace.name` in the sheet.

## Film

Film appearance owns only the canvas clear color. Canvas dimensions are an explicit
`space:Canvas` graph value, while frame rate comes from the Timeline's Clock.

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
<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline} appearance={recipes.film.vertical}>
```

## Caption Fine

The first official Caption Style family keeps planning and rendering parameters in one Recipe.

```svs
caption.dialogue {

  x: 0.08;
  y: 0.76;
  width: 0.84;
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
| `x`, `y` | Position as fraction of canvas (0–1) |
| `width` | Width as fraction of canvas |
| `size` | Font size in pixels |
| `line-height` | Line height multiplier |
| `align` | Text alignment: `left`, `center`, `right` |
| `fill` | Text color (hex, supports alpha) |
| `background` | Container background color (hex, supports alpha like `#09090BCC`) |
| `padding` | Container padding in pixels (single value or `vertical horizontal`) |
| `radius` | Container border radius in pixels |

For reproducible rendering, select an exact installed face in the `.svml` source and pass that
Record to the Fine Style. Family, weight and style have one source of truth on this exact font edge:

```svml
<fonts:Face id="caption-font" package="@fontsource-variable/inter" weight="600" style="normal"/>
<caption-fine:Style id="primary-caption" recipe={recipes.caption.dialogue}
  font={caption-font}/>
```

### Per-role caption styles

Define multiple caption Recipes for different speakers:

```svs
caption.alice {

  x: 0.08; y: 0.76; width: 0.84;
  size: 58;
  line-height: 0.96;
  align: center;
  fill: #73FBD3;
  background: #09090BCC;
  padding: 16 24; radius: 18;
}

caption.bob {

  x: 0.08; y: 0.76; width: 0.84;
  size: 58;
  line-height: 0.96;
  align: center;
  fill: #FFD166;
  background: #09090BCC;
  padding: 16 24; radius: 18;
}
```

Then select them with timed Uses in the Track:

```svml
<fonts:Face id="caption-font" package="@fontsource-variable/inter" weight="600" style="normal"/>
<caption-fine:Style id="default-caption" recipe={recipes.caption.dialogue} font={caption-font}/>
<caption-fine:Style id="alice-caption" recipe={recipes.caption.alice} font={caption-font}/>
<caption-fine:Style id="bob-caption" recipe={recipes.caption.bob} font={caption-font}/>
<caption-fine:Caption id="captions" document={story.caption} timing={story-captions}
  timeline={speech.timeline} within={vertical.bounds}>
  <caption-fine:Use style={default-caption}/>
  <caption-fine:Use role="ALICE" style={alice-caption}/>
  <caption-fine:Use role="BOB" style={bob-caption}/>
</caption-fine:Caption>
```

## Visual Track Clips

Visual Clips keep space, temporal sampling, pixel treatment and local motion separate. A `SpatialFrame`
owns position and size. Fitting and the optional partial temporal sampling relation are direct facts of
this occurrence. A
treatment Recipe may reuse image and Frame paint, while a typed Motion is reusable affine/opacity
keyframes rather than a closed effect name.

```svs
visual.product {
  frame-paint: #111116;
  clip: rounded;
  radius: 28;
  padding: "0";
  border-width: 1;
  border-style: solid;
  border-color: #FFFFFF20;
  shadows: 0 10 24 0 #00000066;
}
```

| Property | Description |
|---|---|
| `fit` | Direct `contain`, `cover`, `fit-width`, `fit-height`, `native`, `scale-down`, or `stretch` |
| `frame-x`, `frame-y` | Alignment point inside the placement Frame |
| `content-x`, `content-y` | Independently selected focal point inside the source |
| `Map` child | Clip-owned partial mapping for timed-source coordinates |
| `frame-paint` | Solid or gradient Paint behind the sampled source |
| `clip`, `radius`, `padding` | Frame clipping and inset |
| `border-*`, `shadows` | Frame-owned border and ordered shadows |
| `motion` / `Pose` | Optional typed affine and opacity states over the Clip-local clock |

Position remains an explicit Source reference:

```svml
<space:Frame id="product-frame" within={vertical.bounds}
  left="8%" top="20%" right="92%" bottom="68%"/>
<visual:Motion id="product-in">
  <visual:Pose at="start" y="80" opacity="0" easing="ease-out"/>
  <visual:Pose at="8f" y="0" opacity="1"/>
  <visual:Pose at="end" y="0" opacity="1"/>
</visual:Motion>
<visual:Clip media={product-media.media}
  during={demo} frame={product-frame} fit="contain"
  treatment={recipes.visual.product} motion={product-in}>
  <visual:Map/>
</visual:Clip>
```

If a behavior coordinates several objects, changes structure or gives a source a new visual role,
author a component. Motion is the shared mathematical substrate, not a catalogue of every effect a
video may ever need.

## Text

Fine Text Style owns reusable typography and Paint only. The occurrence itself owns geometry,
form-specific layout and its `z` inside the containing VisualScope, because those facts change from one use of a Style to another.

```svs
text.title {
  weight: 900;
  size: 64;
  fill: #FFFFFF;
  tracking: -1;
}
```

| Property | Description |
|---|---|
| `weight` | Font weight |
| `size` | Font size in pixels |
| `fill` | Text color |
| `tracking` | Letter spacing adjustment |

Compiled with exact font bytes into a `text:Style`, then referenced by a concrete placement form:

```svml
<fonts:Face id="title-font" package="@fontsource-variable/inter" weight="900" style="normal"/>
<text:Style id="title-style" recipe={recipes.text.title} font={title-font}/>
<text:Flow id="meaning" timeline={speech.timeline} within={title-frame}
  style={title-style} align="center" during={speech.window}>
  MEANING
</text:Flow>
```

## Speaker Text Template

The Recipe selects the prompt axes declared by the data-only `speaker-v1` Text Template. Model,
resolution, references and duration remain explicit inputs to `seedance:ReferenceVideo`; they are
not hidden in this Recipe.

```svs
speaker.host {
  composition-stability: soft-locked;
  camera-motion: none;
  edit-rhythm: continuous-take;
  performance: natural-explainer;
  gesture: natural;
}
```

| Property | Description |
|---|---|
| `composition-stability` | Camera/composition consistency: `flexible-ugc`, `soft-locked`, `strict-locked` |
| `camera-motion` | Camera movement: `none`, `subtle-punch-in-return` |
| `edit-rhythm` | Editing style: `continuous-take`, `pause-trim-jump-cuts` |
| `performance` | Acting style: `natural-explainer`, `high-energy-ugc`, `calm-authority`, `reactive-playful` |
| `gesture` | Gesture intensity: `restrained`, `compact`, `natural`, `expressive` |
Referenced by `text:Render` together with the Kit's Template:

```svml
<text:Render id="hook-prompt"
  template={speaker-kit.speaker-v1} recipe={recipes.speaker.host}>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Set name="action" text={hook-action}/>
</text:Render>
```

## Generic Text Template Recipes

The same precedence is available without a domain wrapper. `text:Render` can read any SVS Recipe,
project only properties declared by its template, and let explicit `text:Param` children override
them. This is how the data-only Seedance B-roll, Podcast, Call, Street Interview and reference
transfer Kits remain separate from Seedance execution.

```svs
broll.product-demo {
  material-mode: product-beauty;
  story-shape: process-demo;
  edit-language: insert-cutaway;
  camera-language: product-macro;
  motion-intensity: readable;
}
```

Street Interview, Podcast and Call use the same Recipe mechanism rather than hand-written fixed
prompt prose. For example:

```svs
interview.street {
  framing: soft-handheld;
  pacing: compact;
  performance: natural-street;
  reaction: active;
  gesture: natural;
}
```

`street-interview-v1` reads those five axes. Its per-take `action` carries camera changes in authored
order. `podcast-v1` and `call-v1` read the corresponding
`framing`, `edit-language`, `pacing`, `performance`, `reaction` and `gesture` axes with their own
finite values. The selected Kit file is the authority for allowed values and defaults.

Model, resolution, duration and reference media remain explicit on the model declaration and its
Source references.

## Exact font declarations

SVS describes typography policy, but it does not choose or open font bytes. The official Hypit
Distribution supplies the Fontsource adapter; install the selected upstream font packages in the
video project's `package.json`. The ordinary lockfile fixes their actual versions:

```svml
<import as="fonts" from="@hypit/fontsource@1"/>
<import as="media" from="@hypit/media@1"/>

<fonts:Face id="caption-latin" package="@fontsource-variable/inter" weight="600" style="normal"/>
<fonts:Face id="caption-han" package="@fontsource-variable/noto-sans-sc" weight="600" style="normal"/>
<media:FontStack id="caption-fonts" primary={caption-latin}>
  <media:Fallback font={caption-han}/>
</media:FontStack>
```

| Property | Description |
|---|---|
| `package` | One installed `@fontsource` or `@fontsource-variable` package |
| `weight` | Exact selected face weight |
| `style` | Selected style: `normal` or a package-supported `italic` |

Fonts come from the `@fontsource` packages installed by the project. Their metadata, CSS and font
files become Resource-backed font values:

```svml
<caption-fine:Style id="dialogue" recipe={recipes.caption.dialogue}
  font={caption-fonts}/>
```

`media:FontStack` emits one generic `FontStackRef`; its primary and fallbacks preserve their own honest
metadata. The Caption Recipe does not repeat family, weight or style. CJK and Emoji can be split into several
Unicode-range files while remaining one font stack. Terminal Text and Fine Caption require that
stack explicitly.
For a symbol with both text and Emoji presentation, write the authored Unicode Emoji sequence
(for example `☎️`, including VS16); no package rewrites display text to force color.

Brand and custom fonts remain explicit author assets rather than additions to a central catalog:

```svml
<import as="media" from="@hypit/media@1"/>
<media:Font id="brand" src="./assets/Brand-Semibold.woff2"
  weight="600" style="normal"/>
```

## Combination example

A complete `recipes.svs` file for a four-take talking-head project:

```svs
<?svml using="@hypit/recipe@1"?>

<sheet version="1" id="studio">

  speaker.host {
    composition-stability: soft-locked;
    camera-motion: none;
    edit-rhythm: continuous-take;
    performance: natural-explainer;
    gesture: natural;
  }

  film.vertical {
    background: #09090B;
  }

  caption.primary {

    x: 0.08;
    y: 0.74;
    width: 0.84;
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
<import as="recipes" source="./recipes.svs"/>

<text:Render id="hook-prompt" template={speaker-kit.speaker-v1}
  recipe={recipes.speaker.host}>...</text:Render>

<caption-fine:Style id="primary-caption" recipe={recipes.caption.primary} font={caption-font}/>

<space:Canvas id="vertical" width="720" height="1280"/>
<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline} appearance={recipes.film.vertical}>
```
