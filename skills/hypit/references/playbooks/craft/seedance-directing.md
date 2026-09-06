# Directing generated performance

Read this when turning useful visual references and Script into living speech, interaction or
silent action. The image establishes who and where; motion makes something happen to them.

Seedance 2 Mini at `720p` is the usual recommendation for capable, affordable generated performance.
Choose another model or resolution when the work's visual or performance needs call for it.

## Give each input its own responsibility

| Input | Responsibility |
| --- | --- |
| Character-and-scene references | appearance, setting, framing and the physical state to preserve |
| Recurring voice references | the intended speaker's voice identity |
| Script dialogue projection | the exact words and speaking turns |
| Kit Recipe | recurring camera, edit, pace and performance choices |
| Action direction | this passage's attitude, attention, physical interaction and motivated cuts |

Seedance exposes three distinct request shapes:

| Surface | Inputs and use |
| --- | --- |
| `seedance:TextVideo` | Text alone; useful when the intended world does not need visual identity or composition references. |
| `seedance:FrameVideo` | A required first frame and optional last frame for literal endpoint control. |
| `seedance:ReferenceVideo` | One or more image, video, or audio references that guide identity, world, voice, motion, or camera language without declaring literal endpoints. |

Most controlled Hypit production starts from useful generated images and uses reference generation.
That reflects the work's need for identity, scene, composition, and repeatable visual relationships;
it does not remove the other request shapes when their meaning fits. A last frame belongs only when
the shot genuinely needs to arrive at that exact image.

Kits produce ordinary Text; the Source connects that Text and explicit references to the selected
request shape. Action does not secretly add references. The reusable package Sources are:

| Import | Intended prompt relationship |
| --- | --- |
| `@hypit/seedance-kits/speaker` | One visible speaker, one character-and-scene image, and one voice reference. |
| `@hypit/seedance-kits/broll` | A silent visual event or montage. |
| `@hypit/seedance-kits/podcast` | Two conversation views and their two voices. |
| `@hypit/seedance-kits/call` | Two video-call reverse views. |
| `@hypit/seedance-kits/street-interview` | Interviewer, guest, shared view, and two voices. |
| `@hypit/seedance-kits/motion-reference` | Preserve the subject while transferring body motion. |
| `@hypit/seedance-kits/camera-reference` | Preserve the subject while transferring camera language. |

A speaking Take can be assembled directly from the installed Source:

```svml
<import as="text" from="@hypit/text@1"/>
<import as="seedance" from="@hypit/seedance@1"/>
<import as="speaker-kit" source="@hypit/seedance-kits/speaker"/>

<text:Render id="hook-prompt" template={speaker-kit.speaker-v1}
  recipe={look.speaker.host}>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Set name="action" text={hook-action}/>
</text:Render>

<seedance:ReferenceVideo id="hook-take" model="mini" prompt={hook-prompt}
  duration="8" resolution="720p" aspect-ratio="9:16" generate-audio="true">
  <seedance:Reference image={presenter}/>
  <seedance:Reference audio={voice}/>
</seedance:ReferenceVideo>
```

The selected model vocabulary supplies its current duration, reference-count, format, and media
limits. The Kit does not own those limits or the request's explicit media edges.

Use the Script's `.dialogue` Text rather than retyping dialogue into action. Map Role names to the
Kit's A/B identities where necessary. Preserve one recurring voice reference per character when
voice continuity matters. See [Voice and performance](voice-and-performance.md) for A-roll versus
genuinely independent narration.

## Direct the reason for a gesture

Start with the social situation and attitude: affectionate ridicule, candid surprise, dry confidence,
playful skepticism. Then choose a few visible actions that communicate it. A restrained lean, an
open-palmed explanation, a knowing shrug or a short glance can carry more than elaborate choreography.
Vibe alone may leave an important interaction unspecified; describe the decisive action when the
story needs a handoff, a look toward a partner or an exit.

Natural emphatic gestures are usually more reliable than asking fingers to display an exact number.
Let speech, Caption or MG convey the quantity while pointing and hand actions serve the performance.

Silence still has behavior. A listener can settle in the chair, notice the object, glance down and
look back up, breathe or smile while keeping their mouth out of the speaking performance. Pick small
actions that follow the exchange.

An encounter also has edges. Someone being interrupted can first be busy; someone finishing can
begin to leave. Those small causes make the clip feel like a piece of life rather than a pose that
starts and stops at the encoder's boundaries.

## Choose cuts as part of the performance

UGC can benefit from pause-trim jump cuts. A podcast can cut with the speaker or toward a meaningful
reaction. A street interview can favor the guest and use the interviewer close view for surprise.
Stable camera framing, expressive acting and frequent edits are compatible choices.

One Take can contain multiple shots, several speaking turns or a split-screen composition. One
Segment is not one speaker turn or one camera shot. Conversely, several UGC Takes can use the same
character-and-scene image and meet at natural editorial cuts. A genuinely continuous shot calls for
the model mode and direction that preserve that action. See [Reference relationships](generated-dependencies.md).

The Speaker Kit's `pause-trim-jump-cuts` requests an edited rhythm from the model. It does not inspect
or trim the returned media. If a produced pause actually needs editing, use an explicit media
operation and align the resulting edited media; a prompt choice is not a deterministic postprocess.

## Size the request around the delivery

Use `hypit measure` on the target Segment at its intended pace, accounting for interaction and pauses.
[Script and time](../../creation/script-and-time.md#measure-before-choosing-durations) explains the
command, rounding, and how estimates inform the writing. The original video's seconds help explain
its rhythm; the target's delivery determines how much generated media this passage needs.

Read the selected model's supported whole-second duration values with
`hypit vocabulary @hypit/seedance`. They constrain one generation request; the finished work and its
individual edited beats can have other lengths.

An estimate outside that range is a useful creative question. A brief question and its answer might
share one Take; a line might gain a few useful words or a natural reaction; a long exchange might
divide where the thought turns. Find the shape that serves the passage, then choose a supported
integer duration for the intended performance. After production, actual normalized media and
alignment supply its timing and word anchors.

Watch the result for the decisions that matter: engaged performance, correct speaking identity,
legible interaction, intentional cuts and the right degree of energy. Correct words alone do not
establish that the scene works. Continue the authorized production and revise a visible problem at
its owner.
