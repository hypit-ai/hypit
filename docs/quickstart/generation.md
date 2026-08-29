---
title: Media & Generation
description: Declaring media assets and generating video with Seedance.
---

# Media & Generation

This page covers components that declare static assets and generate new media — the raw materials
that flow into the timing and track stages downstream.

Every component shown here must be imported by its package specifier before use:

```svml
<import as="media" from="@hypit/media@1"/>
<import as="mediaop" from="@hypit/media-pipeline@1"/>
<import as="estimate" from="@hypit/estimate@1"/>
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="speaker-kit" source="./kits/speaker-v1.svs"/>
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

Typically used as a voice-timbre reference for `seedance:ReferenceVideo`.

## estimate:Speech

Deterministic speech duration planning from Script pronunciation text. No external service call — the
duration is computed locally from pronunciation units and a delivery-density policy.

```svml
<estimate:Speech id="hook-duration"
  source={story.segment.hook.speech}
  policy={recipes.speech.normal}/>
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
<import as="text" from="@hypit/text@1"/>

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

Seedance exposes model capabilities, not creative usages. `standard`, `fast`, `mini` and `2.5`
choose the exact model independently of three invocation shapes. All shapes consume a complete
ordinary `Text` prompt and output `{id.video}`.

Seedance 2.5 uses the same Surfaces; it is not a Runtime substitution for another model. Its exact
contract accepts 480p/720p, up to 30 image, 10 video and 10 audio references, and either `-1` for
model-selected duration or an integer from 4 through 30 seconds:

```svml
<seedance:ReferenceVideo id="long-take" model="2.5"
  prompt={long-direction} duration="30" resolution="720p">
  <seedance:Reference image={presenter-reference}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
```

### seedance:TextVideo

Prompt-only generation. This is the only shape that accepts `web-search`.

```svml
<seedance:TextVideo id="ambient" model="mini"
  prompt={ambient-direction} duration="5" web-search="false"/>
```
Craft requires every take to start from an accepted image, so a first frame or ordered references are
the shapes to author with. This shape is documented because the model has it, not because a take
should begin without a picture.


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

The component does not know that this is a talking head. That meaning lives in the supplied Text.

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

`@hypit/seedance-kits` contains seven data-only Text Templates. A Kit is not a model wrapper: use
generic `text:Render` to produce the prompt, then connect that Text and the real media references to
the low-level Seedance Surface.

Copy only the selected Kit `.svs` files into the video project's `./kits/` directory. Import the
vendored project copy so the Kit bytes remain inside the Source Closure; do not reach back into the
installed Hypit Distribution from project source.

Read the
[`@hypit/seedance-kits` guide](https://github.com/hypit-ai/hypit/blob/main/packages/seedance-kits/README.md)
and the [selected Kit source](https://github.com/hypit-ai/hypit/tree/main/packages/seedance-kits/kits)
before authoring. Use an official Kit whenever its format matches. Keep generation instructions and
dynamic prompt slots in English; preserve the authored language only for dialogue that must be
spoken verbatim. Write a freeform English prompt only when none of the seven Kits applies.

```svml
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="broll-kit" source="./kits/broll-v1.svs"/>

<text:Value id="product-story">
  Show the product opening, the primary feature activating, and the finished result in one readable sequence.
</text:Value>
<text:Render id="demo-prompt"
  template={broll-kit.broll-v1}
  recipe={recipes.broll.product-demo}>
  <text:Set name="story" text={product-story}/>
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

Choose the Kit by format, then provide its declared dynamic slots and ordered references:

| Format | Kit | Dynamic slots | Ordered references |
|---|---|---|---|
| Talking head | `speaker-v1` | `dialogue`; optional `action` | image 1 = speaker/scene; audio 1 = voice |
| Silent B-roll | `broll-v1` | `story` | one or more authored images |
| Two-person podcast | `podcast-v1` | `dialogue`; optional `action` | images 1/2 = A/B views; audio 1/2 = A/B voices |
| Video call | `call-v1` | `dialogue`; optional `action` | images 1/2 = reversed call layouts; audio 1/2 = A/B voices |
| Street interview | `street-interview-v1` | `dialogue`; optional `action` | images 1/2/3 = interviewer/guest/shared views; audio 1/2 = interviewer/guest |
| Motion transfer | `motion-reference-v1` | optional `direction` | image 1 = subject; video 1 = motion reference |
| Camera transfer | `camera-reference-v1` | optional `direction` | image 1 = subject; video 1 = camera reference |

These shapes remain visible in `seedance:ReferenceVideo`; Kit rendering does not hide media count or
order.

## Street-interview prompt assembly

Use `street-interview-v1` for the stable view order, role, microphone, voice and no-overlay contracts.
Select framing, pacing, performance, reaction and gesture through an SVS Recipe. Put each take's
camera changes and performance in its authored action, in the exact order they should happen:

```svml
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="interview-kit" source="./kits/street-interview-v1.svs"/>

<text:Value id="interview-action">
  Begin with the shared view from @image3 while A asks the question.
  Cut to B's view from @image2 as B pauses briefly, then answers.
</text:Value>

<text:Render id="interview-prompt"
  template={interview-kit.street-interview-v1}
  recipe={recipes.interview.street}>
  <text:Set name="dialogue" text={story.segment.interview.dialogue}/>
  <text:Set name="action" text={interview-action}/>
</text:Render>

<seedance:ReferenceVideo id="interview-take" model="mini"
  prompt={interview-prompt} duration={interview-duration.duration}
  resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={interviewer-view}/>
  <seedance:Reference image={guest-view}/>
  <seedance:Reference image={shared-view}/>
  <seedance:Reference audio={interviewer-voice}/>
  <seedance:Reference audio={guest-voice}/>
</seedance:ReferenceVideo>
```

The dialogue uses explicit `A:`/`B:` order: A is the interviewer and maps to the first audio
reference; B is the guest and maps to the second. The Kit owns the reusable English scaffold, so do
not duplicate it in a hand-written prompt.

## Talking-head prompt assembly

Talking-head authoring does not need a special executable component. The data-only `speaker-v1`
Template, the project's Recipe and the per-take dialogue/action are assembled by the ordinary Text
module. The result enters Seedance through the same explicit `prompt` edge as any other generation.

```svml
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="speaker-kit" source="./kits/speaker-v1.svs"/>

<text:Value id="hook-action">
  Begin with urgent direct eye contact, then let the final admission land more quietly.
</text:Value>

<text:Render id="hook-prompt"
  template={speaker-kit.speaker-v1}
  recipe={recipes.speaker.host}>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Set name="action" text={hook-action}/>
</text:Render>

<seedance:ReferenceVideo id="hook-take" model="mini"
  prompt={hook-prompt}
  duration={hook-duration.duration}
  resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={presenter-clean}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
```

`speaker-v1.svs` selects its own Text Template Frontend. `recipes.svs` supplies the named axis values;
`dialogue` and `action` remain ordinary graph inputs. Neither the Kit nor Text chooses a model,
reference media or generation endpoint.

## Combination example

A two-take setup with estimated durations feeding explicit Text assembly and Seedance generation:

```svml
<import as="media" from="@hypit/media@1"/>
<import as="estimate" from="@hypit/estimate@1"/>
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="recipes" source="./recipes.svs"/>
<import as="speaker-kit" source="./kits/speaker-v1.svs"/>

<media:Image id="presenter-clean" src="./assets/presenter-clean.png"/>
<media:Image id="presenter-alt" src="./assets/presenter-alt.png"/>
<media:Audio id="presenter-voice" src="./assets/presenter-voice.mp3"/>

<estimate:Speech id="hook-duration"
  source={story.segment.hook.speech} policy={recipes.speech.normal}/>
<estimate:Speech id="meeting-duration"
  source={story.segment.meeting.speech} policy={recipes.speech.normal}/>
<text:Value id="hook-action">Start urgently, then become quieter.</text:Value>
<text:Value id="meeting-action">Indicate the product, then return to the lens.</text:Value>

<text:Render id="hook-prompt" template={speaker-kit.speaker-v1} recipe={recipes.speaker.host}>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Set name="action" text={hook-action}/>
</text:Render>
<text:Render id="meeting-prompt" template={speaker-kit.speaker-v1} recipe={recipes.speaker.host}>
  <text:Set name="dialogue" text={story.segment.meeting.dialogue}/>
  <text:Set name="action" text={meeting-action}/>
</text:Render>

<seedance:ReferenceVideo id="hook-take" model="mini" prompt={hook-prompt}
  duration={hook-duration.duration} resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={presenter-clean}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
<seedance:ReferenceVideo id="meeting-take" model="mini" prompt={meeting-prompt}
  duration={meeting-duration.duration} resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={presenter-alt}/>
  <seedance:Reference audio={presenter-voice}/>
</seedance:ReferenceVideo>
```

Each `seedance:ReferenceVideo` produces a `{*.video}` output that feeds into `speech:Track` in the
next stage. Different takes can use different reference images while sharing the same voice timbre
and prompt Recipe.
