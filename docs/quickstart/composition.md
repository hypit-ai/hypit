---
title: Film & Rendering
description: Assemble peer visual and audio contributions, then render the selected program range.
---

Film is an ordinary author component. It combines explicitly selected VisualTrack and AudioTrack
outputs with one Canvas and one Timeline, producing a Composition. The renderer turns that
Composition into a video.

```svml
<import as="space" from="@hypit/spatial@1"/>
<import as="film" from="@hypit/film@1"/>
<import as="html" from="@hypit/html-video@1"/>
```

## Assemble the Film

```svml
<space:Canvas id="vertical" width="1080" height="1920"/>

<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline}
  appearance={recipes.film.vertical}>
  <film:Track id="picture" source={picture.visual}/>
  <film:Track source={mix.audio}/>
  <film:Track id="cards" source={cards.visual}/>
  <film:Track id="captions" source={captions.visual}/>
  <film:Track id="meaning" source={meaning.visual}/>
</film:Film>
```

| Attribute | Required | Meaning |
|---|---|---|
| `id` | yes | Public composition identity |
| `canvas` | yes | The picture coordinate system |
| `timeline` | yes | The finite absolute program range |
| `appearance` | yes | Film Recipe, including the clear color |

Each `<film:Track>` accepts one VisualTrack or AudioTrack. Film does not discover sibling outputs.
If one PreparedMedia source should contribute both picture and sound, author one Visual Clip and one
Audio Clip from that media; both resulting Tracks must then be selected here.

Common outputs include:

| Source | Type | Role |
|---|---|---|
| `{picture.visual}` | VisualTrack | picture occurrences placed by Visual Track |
| `{mix.audio}` | AudioTrack | placed voices, music and effects from Audio Track |
| `{cards.visual}` | VisualTrack | independent image/video Clips |
| `{captions.visual}` | VisualTrack | a Caption family |
| `{scene.visual}` | VisualTrack | a project component |

The public output is `{main.composition}`.

## Visual order belongs to the parent Scope

Film children select and place contributions. Every visual `<film:Track>` and `<film:Stack>` carries
an `id` owned by its immediate parent VisualScope. Siblings paint in declaration order from back to
front. Components publish only their reusable Track-local programme and do not carry a position in an
unknown future Film. A Stack closes its child VisualScope and enters the parent once at its declared
position. Ids address authored occurrences and never act as hidden paint-order fallbacks. One
VisualTrack may be reused through several distinct member ids.

```svs
film.vertical { background: #09090B; }
media.speaker { fit: cover; }
media.card { fit: contain; }
caption.base { }
```

Items remain inside their owning Track's placement. When several pictures, graphics and text need
interleaved local order because they share layout or motion, one component should own that programme
and its internal element tree or HTML visual. Keep independently useful contributions as peer Tracks.

## Close a local visual stack

Use a Film Stack when a group must first become one picture and an adjustment should affect exactly
that group:

```svml
<import as="adjust" from="@hypit/visual-adjustment@1"/>
<import as="treatment" from="@hypit/visual-treatment@1"/>

<treatment:Color id="cinematic" contrast="1.08" saturation="0.9" hue="-2"/>

<adjust:Track id="look" timeline={speech.timeline}>
  <adjust:Adjustment id="grade" during={speech.window}
    effect={cinematic}/>
</adjust:Track>

<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline}
  appearance={recipes.film.vertical}>
  <film:Track id="background" source={background.visual}/>
  <film:Stack id="treated-subject">
    <film:Track id="subject" source={subject.visual}/>
    <film:Track id="look" source={look.visual}/>
  </film:Stack>
  <film:Track id="captions" source={captions.visual}/>
  <film:Track source={dialogue.audio}/>
</film:Film>
```

The Stack begins with transparency and enters its parent as one picture at its declaration position. The Adjustment
transforms only the picture accumulated inside that Stack. AudioTracks remain at the Film root and
never inherit visual Stack membership.

## Render the complete video

```svml
<html:Video id="final"
  composition={main.composition} timeline={speech.timeline}/>
```

The renderer compiles the visual contributions, captures requested frames, renders AudioTracks and
muxes them into the delivered file. `{final.video}` is an ordinary Resource-backed `Blob` and
the usual Invocation Target.

```svml
<?svml using="@hypit/markup/invocation@1"?>
<svrun version="1">
  <author source="./main.svml"/>
  <target output="final.video"/>
</svrun>
```

## Render a frame interval

```svml
<html:Video id="detail" composition={main.composition} timeline={speech.timeline}
  start-frame="240" end-frame-exclusive="360"/>
```

The bounds use the original Timeline and a half-open interval. At 30 fps this example renders
seconds 8–12. Animation and media sampling retain their original program positions even though the
encoded clip starts at zero. Range rendering limits final capture and encoding; upstream graph work
still follows the selected Invocation, so reuse accepted media and alignment Outputs explicitly.

## A film drawn entirely by components

Timeline does not require speech or media:

```svml
<import as="time" from="@hypit/timeline-author@1"/>

<time:Clock id="animation-clock" frame-rate="30"/>
<time:Timeline id="animation" clock={animation-clock} end="8s">
  <time:Instant id="question" at="0.5s"/>
  <time:Instant id="answer" at="2s"/>
</time:Timeline>

<chat:Scene id="conversation" timeline={animation.timeline} within={canvas.bounds}
  during={animation.window}>
  <chat:Message id="question" at={animation.question} sender="Maya" text="Ready?"/>
  <chat:Message id="answer" at={animation.answer} sender="Leo" text="Let's go."/>
</chat:Scene>

<film:Film id="main" canvas={canvas.canvas} timeline={animation.timeline}
  appearance={recipes.film.main}>
  <film:Track id="conversation" source={conversation.visual}/>
</film:Film>
<html:Video id="final" composition={main.composition} timeline={animation.timeline}/>
```

The component owns its reading rhythm through ordinary absolute time. With no selected AudioTrack,
the result is silent. In a spoken composition, a Narrative Projection can reveal Moments or
Selections as the same absolute Instant and Window inputs.

## Check before execution

```bash
hypit check main.svml
hypit plan build.svrun
```

`check` validates imports, types and graph edges without calling external services. `plan` compiles
the selected Invocation and shows the Operations it would demand. Inspect that plan before paid execution.

See [Timing & Assembly](./timing.md) for media preparation, Timeline construction, media presentation and
semantic projection. See [Tracks](./tracks.md) for Visual and Audio authoring forms.
