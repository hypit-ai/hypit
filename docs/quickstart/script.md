---
title: Script
description: The Script Surface — Segments, Role Cues, Dual Text, Selections, Moments and text projections.
---

# Script

The `<script>` element holds every word the narrator or speakers say. Script is **prose-first**: it
contains no timecodes, no media references, no styling, no generation parameters. Everything else in
the pipeline reads the Script; the Script reads nothing.

```svml
<import from="@narratage/script@1"/>

<script id="story">
  <opening>
    <HOST> Hello world.
  </opening>
</script>
```

The import `@narratage/script@1` activates the Script Surface. The `id` attribute lets other
components refer to the Script and its parts.

## Segments

Segments are ordered blocks of spoken content. The tag name **is** the id — it must be unique within
a Script.

```svml
<script id="story">
  <opening>
    Hello world.
  </opening>

  <pause/>

  <middle>
    This is the second part.
  </middle>

  <close>
    Goodbye.
  </close>
</script>
```

- A Segment can be self-closing (`<pause/>`). An empty Segment has structure but no speech tokens; it
  does not imply silence or any default duration.
- Segments cannot nest — every Segment is a top-level child of `<script>`.
- Segment names follow XML naming rules: letters, digits, hyphens, underscores.

Other components reference individual Segments via `{story.segment.opening}` and their text
projections via `{story.segment.opening.dialogue}` or `{story.segment.opening.speech}`.

## Role Cues

Role Cues identify **who says what** inside a Segment. They are not speaker entities, do not select a
voice, and do not create characters.

```svml
<dialogue>
  <ALICE> What time is it?
  <BOB> It's 8:30.
</dialogue>
```

- A Role Cue has **no close tag**. A turn continues until the next Role Cue or the end of the Segment.
- A Segment must be either entirely with or entirely without Role Cues — mixing is an error.
- The label is 1–32 characters.

Role Cues produce different text projections:

| Projection | Output for the example above |
|---|---|
| **dialogue** | `ALICE: What time is it?`<br>`BOB: It's 8:30.` |
| **speech** | `What time is it?`<br>`It's 8:30.` |
| **caption** | `What time is it?`<br>`It's 8:30.` |

The dialogue projection includes Role Cue prefixes. Speech and caption projections strip them.
Components like `seedance:Speech` use `{story.segment.dialogue.dialogue}` (with labels) while
`caption:Track` uses the caption projection (without labels).

## Dual Text

When what is displayed on screen differs from what is spoken:

```svml
<explanation>
  <HOST> We call it <SVML | semantic video markup language>.
</explanation>
```

The left side goes to the **caption** projection; the right side goes to **dialogue** and **speech**.

| Projection | Output |
|---|---|
| **caption** | `We call it SVML.` |
| **speech** | `We call it semantic video markup language.` |

An empty left side is legal:

```svml
<HOST> I was < | um> saying that this works.
```

This means "um" is spoken but never displayed as a caption. The two sides can have different word
counts — this is an N:M text mapping, not a 1:1 substitution.

## Selections

Selections are named time **ranges** declared inline:

```svml
<script id="story">
  @whole
  <opening>
    <HOST> @problem Current tools make agents operate a timeline. @/problem
  </opening>

  <answer>
    <HOST> @solution SVML removes that editing loop. @/solution
  </answer>
  @/whole~
</script>
```

### Syntax

| Marker | Meaning |
|---|---|
| `@id` | Open, right-absorbing (starts at the next word) |
| `~@id` | Open, left-absorbing (starts at the previous word's end) |
| `@/id` | Close, left-absorbing (ends at the previous word's end) |
| `@/id~` | Close, right-absorbing (ends at the next word's start) |

The `~` suffix/prefix controls whether the boundary snaps to the left or right. Default open is
right-absorbing; default close is left-absorbing.

### Non-contiguous Selections

The same id can appear multiple times to create a Selection with gaps:

```svml
<demo>
  <HOST> @beat First point. @/beat Then something else. @beat Third point. @/beat
</demo>
```

`{story.selection.beat}` now covers two disjoint ranges.

### Crossing Selections

Selections are not required to nest like XML tags. They can cross each other:

```svml
<demo>
  <HOST> @a One @b two @/a three @/b.
</demo>
```

Selection markers are zero-width and never appear in any text projection. They compile into
`SelectionSet` values containing `Range[]`. Script itself contains no seconds or frame numbers —
timing comes from WhisperX alignment.

Other components reference Selections via `{story.selection.problem}` to bind visual content to
semantic moments in the narrative.

## Moments

Moments are named time **points** (not ranges):

```svml
<ecosystem>
  <HOST> @ranking! Image generation, video generation, captions and B-roll
         all become reusable components.
</ecosystem>
```

| Marker | Meaning |
|---|---|
| `@id!` | Right-absorbing (point at the next word's start) |
| `~@id!` | Left-absorbing (point at the previous word's end) |

Moments compile into `MomentSet` values containing `Point[]`. Selection and Moment share the same
name namespace — the same id cannot be used for both.

Other components reference Moments via `{story.moment.ranking}`.

## Slots

Variable interpolation for templated Scripts:

```svml
<intro>
  <HOST> Meet <${product} | ${product_pronunciation}>.
</intro>
```

Slot ids are 1–64 characters, starting with a letter or underscore. Binding values are literal
text — they cannot inject SVML syntax. Slots are parsed first, then bound.

## Comments and escaping

```svml
<!-- This is a comment. Comments never enter any projection. -->

<demo>
  <HOST> Follow us \@svml on social media.
</demo>
```

Reserved syntax starters must be escaped:

| Escape | Produces |
|---|---|
| `\@` | literal `@` |
| `\<` | literal `<` |
| `\${` | literal `${` |
| `\\` | literal `\` |

Inside Dual Text, also escape `\|` and `\>`.

## Combination example

A complete Script using all constructs together:

```svml
<script id="story">
  @whole
  <hook>
    <HOST> @problem Girls, you need to hear this. Never let anyone take credit
           for your work. @/problem
  </hook>

  <meeting>
    <HOST> @solution I started sending <BCC | B C C> recaps after every
           meeting: timestamps, decisions, who said what. @ranking! After
           the first recap, everything changed. @/solution
  </meeting>

  <evidence>
    <HOST> That gave me @emphasis the courage I was missing @/emphasis.
  </evidence>

  <payoff>
    <HOST> And guess what? I'm sitting in my old boss's chair now.
  </payoff>
  @/whole~
</script>
```

This Script declares:

- Four Segments: `hook`, `meeting`, `evidence`, `payoff`
- One Role Cue: `HOST` (consistent across all Segments)
- One Dual Text: `<BCC | B C C>` (displayed as "BCC", spoken as "B C C")
- Three Selections: `whole` (entire Script), `problem`, `solution`, `emphasis`
- One Moment: `ranking` (marks the instant "After the first recap")

Downstream components reference these by name: `{story.segment.hook.dialogue}` for generation,
`{story.selection.problem}` for B-roll timing, `{story.moment.ranking}` for a visual card reveal.
