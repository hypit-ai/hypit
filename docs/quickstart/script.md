---
title: Script
description: The Script Surface — Segments, Role Cues, Dual Text, Selections, Moments and text projections.
---

# Script

The `<script>` element holds every word the narrator or speakers say. Script is **prose-first**: it
contains no timecodes, no media references, no styling, no generation parameters. Everything else in
the pipeline reads the Script; the Script reads nothing.

```svml
<import from="@hypit/script@1"/>

<script id="story">
  <opening>
    <HOST> Hello world.
  </opening>
</script>
```

The import `@hypit/script@1` activates the Script Surface. The `id` attribute lets other
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

The dialogue `Text` includes Role Cue prefixes. Speech `Text` and the CaptionDocument strip them.
Prompt programs feeding `seedance:ReferenceVideo` may use `{story.segment.dialogue.dialogue}` (with labels).
Script emits `{story.caption}` as one CaptionDocument containing Display Words, N:M Alignment Units
and authored Cue Breaks. It contains no seconds or frames.

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
counts — this is an N:M Alignment Unit, not a 1:1 substitution. A Selection cannot split that unit.

Markers belong to the spoken side of Dual Text. The display side is literal; an unescaped `@` there
is rejected. Escape it as `\@` when the at-sign should be shown.

`||` is the **Caption Cue Break** syntax. It records a boundary between complete Alignment Units;
it cannot appear inside Dual Text or split an N:M unit. Cue timing is still obtained later by
joining the CaptionDocument to the SemanticTrack.

### Flat token attributes

A display word may carry one flat attribute block. The block is postfix, never nested, and has no
timing meaning:

```svml
<HOST> This is really{emphasis,keyword} important{brand}.</HOST>
```

An entry without `=` has the value `true`; scalar values may be written as `name=value`. Caption
maps attribute names to local word Styles, while a Selection still supplies the surrounding Unit
Style. Attributes cannot split or wrap a Dual Alignment Unit.

### CaptionDocument vocabulary

`CaptionDocument` is the Script-owned caption truth. Its named parts are:

- **Display Word** — one rendered lexical surface, including display punctuation;
- **Alignment Unit** — the smallest display-to-speech correspondence, including N:M Dual Text;
- **Cue Break** — an authored boundary after a complete Alignment Unit, written `||`.

Punctuation is not a speech token and never receives its own timing window. Closing punctuation after
a Dual Text attaches to the preceding Display Word (`<test | now>. here` displays as `test. here`),
while the spoken projection remains `now. here`. English words are lexical units; Han, Hiragana and
Katakana text is split into character-level lexical units so Chinese does not become one giant word.

## Selections

Selections are named semantic **ranges** declared inline. Each name has one opening and one closing
marker; the value is a pair of semantic anchors, not a frame span:

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

### Multiple named Selections

Different names may overlap or cross. Each name still has exactly one interval:

Selections are not required to nest like XML tags. They can cross each other:

```svml
<demo>
  <HOST> @a One @b two @/a three @/b.
</demo>
```

Selection markers are zero-width and never appear in any text projection. They compile into one
`NarrativeSelection` with `startAnchorId` and `endAnchorId`. Script itself contains no seconds or
frame numbers — timing comes from SemanticTrack alignment.

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

Each Moment name occurs once and compiles into one `NarrativeMoment` with an `anchorId`. Selection
and Moment share the same name namespace — the same id cannot be used for both.

Other components reference Moments via `{story.moment.ranking}`.

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
| `\\` | literal `\` |
| `\|` | literal `|` (use `\|\|` for two literal pipes) |

Inside Dual Text, the first unescaped `|` separates display from speech; escape display-side
pipes as `\|`. Escape `\>` when a literal closing angle is needed.

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
