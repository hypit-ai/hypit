# Picture Presents (`visual-clips.md`)

Read this when placing images, videos, HTML components, or nested compositions on Picture Tracks. [Media preparation](media.md) owns Project Media (`*.media.json`), [spatial layout](spatial.md) owns `<layout>` and `fit`, and [timing](timing.md) owns exact rational seconds and `<source-time>`.

## Place a Picture Present

A picture occurrence on a `<track kind="picture">` is a `<present>` element whose `source` attribute selects one of three source shapes:

- `source="media"` — a Project Media asset (`<media path="./media/shot.media.json" />`), such as a video or still image.
- `source="component"` — a registered NLE component (`<component package="@hypit/text-fine" symbol="fine" />`), parameterized by `<parameters>`, optional `<value>`, and optional `<media-input>`.
- `source="composition"` — a nested `<composition>` in the same SVML document (`<composition ref="intro" />`).

Every `<present>` includes one `<source-time>` child and a `<picture>` appearance (plus an optional `<audio />` appearance on `media` or `composition` Presents when you also want its embedded audio):

```xml
<track id="picture" name="Picture" kind="picture" role="picture" enabled="true">
  <present id="speaker" name="Speaker" source="media" start="0/1" duration="15/2" enabled="true">
    <media path="./media/speaker.media.json" />
    <source-time>
      <linear target-start="0/1" target-end="15/2" source-start="0/1" rate="1/1" />
    </source-time>
    <picture>
      <layout x="0" y="0" width="1080" height="1920" fit="cover" content-x="0.5" content-y="0.5" />
    </picture>
  </present>

  <present id="product-card" name="Product Photo" source="media" start="2/1" duration="3/1" enabled="true">
    <media path="./media/product.media.json" />
    <source-time>
      <linear target-start="0/1" target-end="3/1" source-start="0/1" rate="0/1" />
    </source-time>
    <picture>
      <layout x="120" y="420" width="840" height="840" fit="contain" />
      <process id="card-motion" package="@project/picture-effects" symbol="transform" enabled="true">
        <parameters>{"kind":"constant","state":{"opacity":1}}</parameters>
        <control-time>
          <linear target-start="0/1" target-end="3/1" source-start="0/1" rate="1/1" />
        </control-time>
      </process>
    </picture>
  </present>
</track>
```

A-roll video, B-roll inserts, generated shots, transparent cutouts, and still images all use the same `<present source="media">` model. Omit `<audio />` on a Picture Present when you want picture only (for example, when audio is placed separately on an Audio Track; see [Audio Presents](audio-clips.md)).

## Keep Destination Time and Source Sampling Distinct

`start` and `duration` on `<present>` state when the occurrence appears on the composition timeline, using exact rational seconds (`numerator/denominator`).

`<source-time>` maps Present-local visible time (`target-start` to `target-end`) to source media time using ordered, non-overlapping `<linear>` or `<cubic>` segments:

- **Native 1x playback**: `rate="1/1"`.
- **Speed change**: `rate="2/1"` plays at 2x; `rate="1/2"` plays at half speed.
- **Freeze / hold**: `rate="0/1"` holds the frame at `source-start` (also used for still images).
- **Reverse**: negative `rate` (e.g., `rate="-1/1"`) traverses backward from `source-start`.
- **Loop / periodic wrap**: supply both `wrap-start` and `wrap-end` on `<linear>`.
- **Piecewise remapping**: combine multiple `<linear>` and `<cubic>` segments inside `<source-time>`.

See [Timing](timing.md) for complete `<source-time>` and `<control-time>` rules.

## Paint Order, Processes, Transitions, and Mattes

- **Track order** is bottom-to-top: later `<track kind="picture">` elements paint over earlier ones. Within a single track, later Presents paint over earlier ones.
- **Occurrence-local Processes**: attach ordered `<process>` children inside `<picture>` using package-owned `(package, symbol)` operators and closed JSON `<parameters>`.
- **Transitions**: attach `<transition>` children to `<composition>` to handle crossfades or wipes across overlapping Presents.
- **Mattes**: attach `<matte>` children to `<composition>` when one picture Present masks another.
- **Shared behavior**: when a recurring visual treatment, multi-layer graphic, or animated layout repeats across shots, package it as a reusable HTML component ([Component Design](component-design.md)) or author it programmatically in TSX ([TSX Authoring](authoring.md)).
