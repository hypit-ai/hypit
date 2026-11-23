# Picture Presents (`visual-clips.md`)

Read this when placing images, videos, HTML components, or nested compositions on Picture Tracks. [Media preparation](media.md) owns Project Media (`*.media.json`), [spatial layout](spatial.md) owns `<layout>` and `fit`, and [timing](timing.md) owns exact rational seconds and `<source-time>`.

## Place a Picture Present

A picture occurrence on a `<track kind="picture">` is a `<present>` element whose `source` attribute selects one of three source types:

- `source="media"` — a Project Media asset (`<media path="./media/shot.media.json"/>`), such as a video or still image.
- `source="component"` — a registered NLE component (`<component package="@hypit/text-fine" symbol="TitleCard"/>`), parameterized by `<parameters>`, `<value>`, and `<media-input>`.
- `source="composition"` — a nested `<composition>` in the same SVML document (`<composition-ref id="..."/>`).

```xml
<track id="picture" name="Picture" kind="picture" role="picture" enabled="true">
  <present id="speaker" name="Speaker" source="media" start="0/1" duration="15/2" enabled="true">
    <media path="./media/speaker.media.json"/>
    <source-time>
      <linear start="0/1" duration="15/2" source-start="0/1" source-duration="15/2"/>
    </source-time>
    <picture>
      <layout x="0/1" y="0/1" width="1080/1" height="1920/1" fit="cover"/>
    </picture>
  </present>

  <present id="product-card" name="Product Photo" source="media" start="2/1" duration="3/1" enabled="true">
    <media path="./media/product.media.json"/>
    <picture>
      <layout x="120/1" y="420/1" width="840/1" height="840/1" fit="contain"/>
      <process>
        <opacity value="1/1"/>
      </process>
    </picture>
  </present>
</track>
```

A-roll video, B-roll inserts, generated shots, transparent cutouts, and still images all use the same `<present source="media">` model. Placing a video Present on a Picture Track only displays its picture; its audio is not heard unless you also place an Audio Present on an Audio Track ([Audio Presents](audio-clips.md)).

## Keep Destination Time and Source Sampling Distinct

`start` and `duration` on `<present>` state when the occurrence appears on the composition timeline, using exact rational seconds (`numerator/denominator`).

For moving media, `<source-time>` maps clip-local time to source media time using `<linear>` or `<cubic>` segments:

- **Native 1x playback**: `duration` equals `source-duration`.
- **Speed change**: `source-duration` larger than `duration` speeds up; smaller slows down.
- **Freeze / hold**: `source-duration="0/1"` holds the frame at `source-start`.
- **Reverse**: negative `source-duration` traverses backward from `source-start`.
- **Piecewise remapping**: multiple contiguous `<linear>` or `<cubic>` segments inside `<source-time>` allow speed ramps, holds, and jumps.

Still images have no source clock and omit `<source-time>`. See [Timing](timing.md) for complete `<source-time>` and `<control-time>` rules.

## Paint Order, Transitions, and Mattes

- **Track order** determines z-order: later `<track kind="picture">` elements paint over earlier ones.
- **Transitions**: attach `<transition>` elements to handle crossfades or wipes between adjacent Presents on the same track.
- **Mattes**: use `<matte>` when one picture Present masks another.
- **Shared behavior**: when a recurring visual treatment, multi-layer graphic, or animated layout repeats across shots, package it as a reusable HTML component ([Component Design](component-design.md)) or author it programmatically in TSX ([TSX Authoring](authoring.md)).
