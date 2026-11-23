# SVML Source Syntax

SVML (`*.svml`) is the durable XML-like document format for an `NleProject`. SVML is pure data —
no imports, variables, functions, conditions, loops, or expressions. Package-owned behavior is
stored as an unversioned `(package, symbol)` pair plus a closed JSON object.

The authoritative specification lives in `packages/nle/SVML.md`.

## Root, Compositions, and Tracks

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svml id="edit" name="Main edit" root="main" edit-rate="30/1">
  <shared-value id="look" name="Main look" owner="operator">
    <operator package="@project/picture-effects" symbol="grade" />
    <value>{"contrast":1.1}</value>
  </shared-value>
  <composition id="main" name="Main" width="1920" height="1080">
    <track id="picture" name="Picture" kind="picture" role="picture" enabled="true">
      <!-- present or adjust items -->
    </track>
    <track id="titles" name="Titles" kind="picture" role="text" enabled="true">
      <!-- component presents -->
    </track>
    <track id="dialogue" name="Dialogue" kind="audio" role="audio" enabled="true">
      <!-- audio presents -->
    </track>
  </composition>
</svml>
```

| Element | Required attributes | Optional attributes | Children |
| --- | --- | --- | --- |
| `svml` | `id`, `name`, `root` | `edit-rate` (default `30/1`) | `shared-value`, `composition` |
| `composition` | `id`, `name`, `width`, `height` | none | `track`, `transition`, `matte`, `group` |
| `track` | `id`, `name`, `kind`, `role`, `enabled` | none | `present`, `adjust` |

- `track.kind`: `picture` or `audio`.
- `track.role`:
  - Picture tracks: `picture`, `text`, `subtitle`, `filter`, or `effect`.
  - Audio tracks: `audio` or `effect`.
- Tracks are ordered **bottom-to-top** (later Picture tracks paint over earlier ones). Within a
  Track, Picture Items paint back-to-front in document order. Audio mixes across tracks.

## Present Items

```xml
<!-- Media Present -->
<present id="take" name="Opening" source="media" start="0/1" duration="10/1" enabled="true">
  <media path="media/opening.media.json" />
  <source-time>
    <linear target-start="0/1" target-end="10/1" source-start="0/1" rate="1/1" />
  </source-time>
  <picture>
    <layout x="0" y="0" width="1920" height="1080" fit="cover" content-x="0.5" content-y="0.5" />
  </picture>
  <audio />
</present>

<!-- Component Present -->
<present id="title" name="Hero Title" source="component" start="1/1" duration="4/1" enabled="true">
  <component package="@hypit/text-fine" symbol="fine" />
  <parameters>{"typography":{"fonts":["Inter","sans-serif"],"fontSizePx":64,"fontWeight":700,"lineHeight":1.15,"letterSpacingPx":0,"wordSpacingPx":0},"paints":[{"kind":"fill","paint":{"kind":"solid","color":"#ffffff"}}],"children":[{"kind":"text","id":"text","text":"Hello Hypit"}],"placement":{"kind":"flow","paddingPx":{"top":0,"right":0,"bottom":0,"left":0},"inlineAlign":"center","blockAlign":"center","wrap":"word","overflow":"visible","columns":1,"columnGapPx":0}}</parameters>
  <source-time>
    <linear target-start="0/1" target-end="4/1" source-start="0/1" rate="1/1" />
  </source-time>
  <picture>
    <layout x="120" y="80" width="1680" height="240" fit="contain" />
  </picture>
</present>

<!-- Nested Composition Present -->
<present id="nested" name="Intro" source="composition" start="0/1" duration="5/1" enabled="true">
  <composition ref="intro" />
  <source-time>
    <linear target-start="0/1" target-end="5/1" source-start="0/1" rate="1/1" />
  </source-time>
  <picture>
    <layout x="0" y="0" width="1920" height="1080" fit="contain" />
  </picture>
  <audio />
</present>
```

- `source="media"`: `<media path="..." />` (portable path relative to the SVML file).
- `source="component"`: `<component package="..." symbol="..." />`, `<parameters>{...}</parameters>`,
  zero or more `<value slot="..." [ref="..."]>` children, and zero or more `<media-input name="..." path="..." />`.
- `source="composition"`: `<composition ref="<sibling-composition-id>" />`.

## Exact Rational Time (`<source-time>` & `<control-time>`)

All times are exact seconds rationals `numerator/denominator` (e.g., `0/1`, `3/2`, `24000/1001`):

- `<linear target-start="..." target-end="..." source-start="..." rate="..." [wrap-start="..." wrap-end="..."] />`
  - `rate="1/1"` normal speed, `rate="0/1"` freeze/hold, `rate="-1/1"` reverse.
- `<cubic target-start="..." target-end="..." source-start="..." source-control-1="..." source-control-2="..." source-end="..." />`
- Edge-aligned Process control time: `<control-time edge="start|end" duration="1/6" control-duration="1/4" />`.

## Processes, Adjusts, Transitions, Mattes, and Groups

- **Occurrence-local Process** (inside `<picture>` or `<audio>`):
  ```xml
  <process id="motion" package="@project/picture-effects" symbol="transform" enabled="true">
    <parameters>{"kind":"constant","state":{"rotationDegrees":0}}</parameters>
    <control-time>
      <linear target-start="0/1" target-end="10/1" source-start="0/1" rate="1/1" />
    </control-time>
  </process>
  ```
- **Track Adjust** (on a `filter` or `effect` Track, applies to signal accumulated below):
  ```xml
  <adjust id="look" name="Grade" package="@project/picture-effects" symbol="grade"
          start="0/1" duration="10/1" enabled="true">
    <parameters>{"contrast":1.1}</parameters>
    <control-time>
      <linear target-start="0/1" target-end="10/1" source-start="0/1" rate="1/1" />
    </control-time>
  </adjust>
  ```
- **Transition** (Composition child, around overlapping Picture Presents):
  ```xml
  <transition id="cut" outgoing="a" incoming="b" package="@project/transitions" symbol="dissolve">
    <parameters>{"softness":0.5}</parameters>
  </transition>
  ```
- **Matte** (Composition child):
  ```xml
  <matte id="mask" content="title" matte="shape" package="@project/mattes" symbol="alpha">
    <parameters>{}</parameters>
  </matte>
  ```
- **Edit Group** (Composition child, moves 2+ items together):
  ```xml
  <group id="reveal">
    <member item="reveal-picture" />
    <member item="reveal-sound" />
  </group>
  ```
