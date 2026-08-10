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
<import as="mediaop" from="@narratage/media-pipeline@1"/>
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
`seedance:ReferenceVideo` or as a B-roll source.

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

Deterministic speech duration planning from Script pronunciation text. No external service call — the
duration is computed locally from pronunciation units and a delivery-density policy.

```svml
<estimate:Speech id="hook-duration"
  source={story.segment.hook.speech}
  policy={studio.speech.normal}/>
```

| Attribute | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `source` | yes | Script text to estimate — typically `{script.segment.NAME.speech}` |
| `policy` | no | SVS speech Recipe controlling pace and bounds; omit it to use inline parameters |

The `policy` references an SVS Recipe (see [SVS Stylesheets](./styles.md#speech-estimation)):

```svs
speech.normal {
  language: en;
  pace: normal;
  min: 4;
  max: 15;
  rounding: round;
}
```

You can also specify estimation parameters inline instead of using an SVS policy:

```svml
<estimate:Speech id="opening-duration"
  source={story.segment.opening.speech}
  language="en" pace="normal" min="4" max="15" rounding="round"/>
```

For English, the official pace presets are `slow = 4.2`, `normal = 4.6`, and
`fast = 5.0` syllables per second. `rate="4.75"` may be used instead of `pace`
when a project needs a value between the named presets. `pace` and `rate` are
mutually exclusive.

There are no implicit policy values: `language`, `min`, `max`, `rounding`, and
exactly one of `pace` or `rate` must be present either inline or in the referenced Recipe.

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

## Seedance invocation shapes

Seedance exposes model capabilities, not creative usages. `standard`, `fast` and `mini` choose the
model variant independently of three invocation shapes. All shapes consume a complete ordinary
`Text` prompt and output `{id.video}`.

### seedance:TextVideo

Prompt-only generation. This is the only shape that accepts `web-search`.

```svml
<seedance:TextVideo id="ambient" model="mini"
  prompt={ambient-direction} duration="5" web-search="false"/>
```

### seedance:FrameVideo

First-frame generation with an optional last frame:

```svml
<seedance:FrameVideo id="transition" model="fast"
  prompt={transition-direction} duration="5"
  first-frame={opening-image} last-frame={closing-image}/>
```

### seedance:ReferenceVideo

Multimodal reference generation. It requires at least one `Reference` child and accepts image,
video and audio references within the model's declared limits.

```svml
<seedance:ReferenceVideo id="alice-take" model="mini"
  prompt={alice-direction}
  duration={alice-duration.duration}
  generate-audio="true">
  <seedance:Reference image={alice-reference}/>
  <seedance:Reference audio={alice-voice}/>
</seedance:ReferenceVideo>
```

The component does not know that this is a talking head. That meaning lives in the supplied Text or
a higher-level package such as `speaker:Take`.

Common attributes are `id`, `model`, `prompt`, `duration`, `resolution`, `aspect-ratio` and
`generate-audio`. `duration` may be literal or an explicit `{estimate.duration}` edge.

The audio generated in an earlier take can be reused as a later reference through an ordinary graph
edge. Extraction does not turn it into speech evidence or attach speaker meaning:

```svml
<mediaop:ExtractAudio id="voice-from-opening"
  source={opening.video} audio="default"/>

<seedance:ReferenceVideo id="follow-up" model="mini"
  prompt={follow-up-direction} duration="5" generate-audio="true">
  <seedance:Reference image={presenter-reference}/>
  <seedance:Reference audio={voice-from-opening.audio}/>
</seedance:ReferenceVideo>
```

The same media-operation package exposes `Transform` for ordered trim/retime and `ExtractFrame` for
first, last, indexed or timestamped still extraction. Local FFmpeg and AWS Lambda are interchangeable
Runtime Endpoints for these exact Needs; neither changes the author graph.

## Seedance semantic Kits

`@narratage/seedance-kits` contains six data-only Text Templates. A Kit is not a model wrapper: use
generic `text:Render` to produce the prompt, then connect that Text and the real media references to
the low-level Seedance Surface.

```svml
<import as="text" from="@narratage/text@1"/>
<import as="seedance" from="@narratage/seedance@1"/>
<import as="broll-kit" source="../../packages/seedance-kits/kits/broll-v1.svs"/>

<text:Render id="demo-prompt"
  template={broll-kit.broll-v1}
  recipe={studio.broll.product-demo}>
  <text:Set name="story" text={copy.product-demo}/>
</text:Render>

<seedance:ReferenceVideo id="demo" model="mini"
  prompt={demo-prompt}
  duration={demo-duration.duration}
  resolution="720p"
  aspect-ratio="9:16"
  generate-audio="false">
  <seedance:Reference image={scene}/>
  <seedance:Reference image={product}/>
</seedance:ReferenceVideo>
```

The project Recipe selects axes such as `material-mode`, `story-shape` and `camera-language`.
`text:Render` reads only properties declared by the template; an explicit `text:Param` overrides a
Recipe value. Dynamic story/dialogue/action/extra content remains a `Text` edge through `Set`.

Available templates are `broll-v1`, `podcast-v1`, `call-v1`, `street-interview-v1`,
`motion-reference-v1` and `camera-reference-v1`. Podcast and Call expect two ordered image
references plus two ordered audio references; Street Interview expects one scene image plus two
ordered voices; the two reference-transfer templates expect one subject image and one reference
video. Those shapes are visible in `seedance:ReferenceVideo`, not hidden in Kit execution code.

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
