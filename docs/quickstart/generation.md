---
title: Media & Generation
description: Declaring media assets and generating video with Seedance.
---

# Media & Generation

This page covers components that declare static assets and generate new media — the raw materials
that flow into the timing and track stages downstream.

Every component shown here must be imported by its package specifier before use:

```svml
<import as="media" from="@narratage/media@1"/>
<import as="estimate" from="@narratage/estimate@1"/>
<import as="seedance" from="@narratage/seedance@1"/>
<import as="speaker" from="@narratage/seedance-speaker@1"/>
```

## media:Image

Declares a content-addressed image asset from a local file.

```svml
<media:Image id="presenter" src="./assets/presenter.png"/>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier for the component |
| `src` | yes | Path to the image file, relative to the `.svml` source |

The image is referenced downstream via `{presenter}` — for example, as a character reference in
`seedance:Speech` or as a B-roll source.

## media:Audio

Declares a content-addressed audio asset from a local file.

```svml
<media:Audio id="presenter-voice" src="./assets/presenter-voice.mp3"/>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `src` | yes | Path to the audio file, relative to the `.svml` source |

Typically used as a voice-timbre reference for `speaker:Take`.

## estimate:Speech

Deterministic speech duration estimation from Script text. No external service call — the estimate is
computed locally from word count and pace parameters.

```svml
<estimate:Speech id="hook-duration"
  source={story.segment.hook.speech}
  policy={studio.speech.normal}/>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `source` | yes | Script text to estimate — typically `{script.segment.NAME.speech}` |
| `policy` | yes | SVS speech Recipe controlling pace and bounds |

The `policy` references an SVS Recipe (see [SVS Stylesheets](./styles.md#speech-estimation)):

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

You can also specify estimation parameters inline instead of using an SVS policy:

```svml
<estimate:Speech id="opening-duration"
  source={story.segment.opening.speech}
  language="en" pace="normal" padding="0.3" min="4" max="15" rounding="ceil"/>
```

**Output:** `{hook-duration.duration}` — the estimated duration in seconds, passed to generation
components.

## text:Value

A reusable literal `Text` value. It is model-neutral and can feed Seedance, GPT Image or any other
declared text port.

```svml
<import as="text" from="@narratage/text@1"/>

<text:Value id="alice-direction">
  Locked medium close-up. Alice speaks directly to camera in a quiet daylight studio.
  Calm, curious delivery; natural breathing and restrained hand movement.
  Spoken dialogue — say exactly: What if editing began with meaning?
</text:Value>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |

The element body is the exact Text value. `text:Render` can produce the same type from a template
and explicit graph inputs.

## seedance:Speech

Generates a talking-head video clip via the Seedance model. This is the low-level generation
component — its complete model input Text already includes any spoken dialogue.

```svml
<seedance:Speech id="alice-take" model="mini"
  prompt={alice-direction}
  duration="8">
  <seedance:Reference image={alice-reference}/>
</seedance:Speech>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `model` | yes | Seedance model name: `mini` |
| `prompt` | yes | Complete model input — reference to ordinary `Text` |
| `duration` | yes | Clip duration in seconds (number or `{estimate.duration}` reference) |
| `resolution` | no | Output resolution: `480p`, `720p` (default varies by model) |
| `aspect-ratio` | no | Output aspect ratio: `9:16`, `16:9`, `1:1` |

### seedance:Reference

Child element that provides a reference image for character consistency:

```svml
<seedance:Reference image={alice-reference}/>
```

| Attribute | Required | Description |
|---|---|---|
| `image` | yes | Reference to a `media:Image` component |

**Output:** `{alice-take}` or `{alice-take.video}` — the generated video, passed to `speech:Spine`.

## seedance:Video

Generates a standalone video clip (not a talking-head — no dialogue lip-sync).

```svml
<seedance:Video id="product-motion" model="mini"
  prompt={product-direction} duration="5">
  <seedance:Reference image={product-reference}/>
</seedance:Video>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `model` | yes | Seedance model name: `mini` |
| `prompt` | yes | Complete model input — reference to ordinary `Text` |
| `duration` | yes | Clip duration in seconds |

Also accepts `<seedance:Reference>` children for reference images.

**Output:** `{product-motion.video}` — used as a B-roll source.

## speaker:Take

A higher-level talking-head component built on the domain-neutral Text Program. Instead of writing
a raw prompt, you provide a Recipe with generation settings and a Text Template that assembles the
model input explicitly in the graph.

```svml
<import as="speaker" from="@narratage/seedance-speaker@1"/>
<import as="ugc" source="../../packages/seedance-speaker/kits/official-ugc-v1.svs"/>

<speaker:Take id="hook-take"
  dialogue={story.segment.hook.dialogue}
  duration={hook-duration.duration}
  recipe={studio.speaker.host}
  kit={ugc.official-ugc-v1}>
  <speaker:Reference image={presenter-clean} role="character-and-scene"/>
  <speaker:Reference audio={presenter-voice} role="voice-timbre"/>
</speaker:Take>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `dialogue` | yes | Script text — typically `{script.segment.NAME.dialogue}` |
| `duration` | yes | Estimated duration from `estimate:Speech` |
| `recipe` | yes | SVS speaker Recipe (see [SVS Stylesheets](./styles.md#speaker)) |
| `kit` | yes | Text Template SVS — the template that assembles model input text |

### speaker:Reference

Child element providing reference media. Accepts both images and audio:

```svml
<speaker:Reference image={presenter-clean} role="character-and-scene"/>
<speaker:Reference audio={presenter-voice} role="voice-timbre"/>
```

| Attribute | Required | Description |
|---|---|---|
| `image` | one of image/audio | Reference to a `media:Image` |
| `audio` | one of image/audio | Reference to a `media:Audio` |
| `role` | yes | Reference purpose: `character-and-scene`, `voice-timbre` |

**Output:** `{hook-take.video}` — the generated video, passed to `speech:Spine`.

### Text Templates

A Text Template can be authored as an SVS file with ordered blocks, variant choices, axis
parameters and slots. The official template is at
`packages/seedance-speaker/kits/official-ugc-v1.svs`.

That source selects the optional Text Template SVS Frontend itself:

```svs
<?svml using="@narratage/text/svs@1"?>
```

The Recipe in `studio.svs` sets the axis parameter values. `speaker:Take` turns those values and
Script dialogue into explicit Text Bindings; the Text render output then enters Seedance's exact
`prompt` port through an ordinary graph edge.

## Combination example

A four-take setup with estimated durations feeding into `speaker:Take` generation:

```svml
<import as="media" from="@narratage/media@1"/>
<import as="estimate" from="@narratage/estimate@1"/>
<import as="speaker" from="@narratage/seedance-speaker@1"/>
<import as="studio" source="./studio.svs"/>
<import as="ugc" source="../../packages/seedance-speaker/kits/official-ugc-v1.svs"/>

<media:Image id="presenter-clean" src="./assets/presenter-clean.png"/>
<media:Image id="presenter-alt" src="./assets/presenter-alt.png"/>
<media:Audio id="presenter-voice" src="./assets/presenter-voice.mp3"/>

<estimate:Speech id="hook-duration"
  source={story.segment.hook.speech} policy={studio.speech.normal}/>
<estimate:Speech id="meeting-duration"
  source={story.segment.meeting.speech} policy={studio.speech.normal}/>
<estimate:Speech id="evidence-duration"
  source={story.segment.evidence.speech} policy={studio.speech.normal}/>
<estimate:Speech id="payoff-duration"
  source={story.segment.payoff.speech} policy={studio.speech.normal}/>

<speaker:Take id="hook-take" dialogue={story.segment.hook.dialogue}
  duration={hook-duration.duration} recipe={studio.speaker.host}
  kit={ugc.official-ugc-v1}>
  <speaker:Reference image={presenter-clean} role="character-and-scene"/>
  <speaker:Reference audio={presenter-voice} role="voice-timbre"/>
</speaker:Take>

<speaker:Take id="meeting-take" dialogue={story.segment.meeting.dialogue}
  duration={meeting-duration.duration} recipe={studio.speaker.host}
  kit={ugc.official-ugc-v1}>
  <speaker:Reference image={presenter-alt} role="character-and-scene"/>
  <speaker:Reference audio={presenter-voice} role="voice-timbre"/>
</speaker:Take>

<speaker:Take id="evidence-take" dialogue={story.segment.evidence.dialogue}
  duration={evidence-duration.duration} recipe={studio.speaker.host}
  kit={ugc.official-ugc-v1}>
  <speaker:Reference image={presenter-alt} role="character-and-scene"/>
  <speaker:Reference audio={presenter-voice} role="voice-timbre"/>
</speaker:Take>

<speaker:Take id="payoff-take" dialogue={story.segment.payoff.dialogue}
  duration={payoff-duration.duration} recipe={studio.speaker.host}
  kit={ugc.official-ugc-v1}>
  <speaker:Reference image={presenter-clean} role="character-and-scene"/>
  <speaker:Reference audio={presenter-voice} role="voice-timbre"/>
</speaker:Take>
```

Each `speaker:Take` produces a `{*.video}` output that feeds into `speech:Spine` in the next stage.
Different takes can use different reference images (e.g. the presenter holding a product in some
Segments but not others) while sharing the same voice timbre and generation recipe.
