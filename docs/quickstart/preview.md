---
title: Live Preview
description: Read a Source as a timeline before anything has been generated.
---

# Live Preview

Everything up to this point has been declarative: a Script, some Recipes, a request for a generated
shot. None of it has produced a picture, and a Seedance take costs money and minutes.

The **SVML Playground** reads the Source itself and draws it — the code on the right, the picture
top-left, a timeline bottom-left. It never writes, and it never calls a Provider.

```bash
pnpm svml:playground -- --source examples/all-components-preview/main.svml
# ➜  http://localhost:5179/
```

| Argument | Meaning |
| --- | --- |
| `--source <main.svml>` | The Author Source to read. Required. |
| `--run <build.svrun>` | A Run Source, read for material and timings it already names. |
| `--runtime <svml.runtime.json>` | Where material earlier Builds produced is kept. Only a Source that reuses an accepted shot through `<build-record>` needs one. |
| `--port <number>` | Defaults to `5179`. |

Both optional arguments are additive. With neither, the Playground still runs on a directory holding
nothing but `main.svml` and its `.svs` style sheet — no package lock, no Runtime Profile, no build.

::: tip Start one server, not four
A second Playground silently takes another port, and you end up reading a stale preview while
describing a new one. Stop the old one first:

```bash
pkill -f svml-playground || true
```

Use `--port` when you genuinely want two Sources side by side.
:::

## Why it can draw a video nobody has made

A Track cannot be built without the material it places. Refusing to draw anything until every shot
exists would make the preview useless for exactly the part of the work it is meant for, so the
Playground separates what it **knows** from what it **assumes**, and says which is which.

**Everything structural is real.** Placement Frames, padding, stacking order, motion and the Track
layout are computed by the same functions a build calls, from your Source and your style sheet. A
card in the wrong part of the frame is wrong here too.

**Timings are estimated** until a build has aligned real audio. Word durations come from
`@narratage/estimate`, the same syllable model the pipeline uses before generation. An estimated
timeline is a proportion, not a prediction — real cut points move once WhisperX has run.

**Missing material stands in**, and each stand-in is announced rather than presented as fact:

| Missing | Shown instead |
| --- | --- |
| A generated shot that names a picture | That picture, held for the length the shot declares |
| A generated shot that names nothing | A black frame of the programme's shape |
| Caption phrasing nobody has planned | The words cut every few Atoms, in the Program's own runs |

The first row is the one that makes this worth opening early. Take the chain from
[Media & Generation](./generation):

```svml
<gpt:Image id="presenter" prompt={look} aspect-ratio="9:16" resolution="2K"/>

<seedance:ReferenceVideo id="take-opening" model="mini" prompt={direction} duration="8">
  <seedance:Reference image={presenter.image}/>
</seedance:ReferenceVideo>
```

`take-opening.video` does not exist until Seedance runs. But the Source says what it will be made
from — `presenter.image` — and how long it will last: `duration="8"`. So the Playground draws the
reference picture, held for eight seconds, in the Frame the take is placed in.

That is not the take. It is the right subject, in the right shape, for the right length, which is
enough to answer whether the framing works and whether the cutaway lands where the speech needs it —
**before** the picture flows into video generation, and before you have paid for a take that turns
out to be cut at the wrong moment.

A declared duration is honoured wherever one exists. Where none does, words are placed at an
ordinary delivery pace and the remaining time is divided evenly.

Drawing stand-ins needs `ffmpeg` on your `PATH`. Without it the shots stay unmade and the Tracks say
so, rather than the preview pretending they were drawn.

## Reading the badges

The header carries two separate claims, because they answer different questions:

| Badge | Meaning |
| --- | --- |
| `timing: measured` | Read from a completed build's aligned transcript. |
| `timing: estimated` | Derived from the Script text at normal delivery pace. |
| `picture: measured` | Every element shows real material. |
| `picture: estimated` | Some shots have not been made, and stand in. |

A Source can have all its footage and still have an estimated timeline: where a cut lands is a
question about speech, not about files. On the timeline itself each Track says whether it was
`made`, is a `stand-in`, or is a black frame, and selecting a clip names the reason in full.

## Feeding it what you already have

As material accumulates, the same preview gets more real without any change to `main.svml`. What a
Source is read with is an authoring decision, so it is made in a Run Source — see
[Run Source & Builds](./run):

```svml
<file id="take-1" type="@narratage/artifact@1#BlobArtifact"
  from="./assets/take-1.mp4" media-type="video/mp4"/>
<satisfy output="take-opening.video" candidate="take-1"/>
```

Point the Playground at it with `--run`, and that shot stops standing in. A `<build-record>`
candidate names something an earlier Build made rather than a path, and needs `--runtime` to find
it; without one, that shot alone is refused **by name** and everything else still draws.

## When an agent is doing the work

If you are working through the [Narratage skill](https://github.com/hypit-ai/narratage/blob/main/.agents/skills/narratage/SKILL.md),
the agent starts the Playground for you and sends you the link after each step that changes the
Source — a Script edit, a Frame moved, a B-roll placed, a Recipe adjusted.

Reading a diff is not the same as seeing where a cutaway lands, and this is the cheapest moment to
say "that card is too high" — before a single Provider has run.

## Next

[SVML Playground](/guide/svml-playground) covers the three-way selection between code, timeline and
picture, the nesting colours, keyboard transport, and how sound is handled.
