# Script and semantic time

Read this before writing or revising `<script>`, when balancing spoken delivery across generated
Takes, or when attaching pictures, Captions, MG, Effects, and Audio to what is said. It also explains
how a passage with no spoken words receives semantic boundaries. This page contains the complete
stable author-facing Script vocabulary; the installed `@hypit/script` package owns parser validation
and edge cases.

[Source syntax](../production/source-syntax.md) covers the surrounding imports, references, Recipes
and Runs; [Tracks](../production/tracks.md) covers the consumers of Script meaning.
[Media preparation](../production/media.md) explains connecting actual footage to a Segment, and
[Runs](../production/runs.md) explains choosing estimated timing for a layout study.

## Script is the target's sole verbal authority

`<script>` contains the words the target video will say. It contains no reference timecodes, media,
visual Style parameters, prompts, or provider decisions. Semantic word attributes such as
`useful{emphasis}` can identify a word's role for a Caption family. Brief may preserve required claims and Treatment may describe
the purpose of a passage, but the adopted wording appears in Source only once.

Use Script's distinct authoring concepts for distinct jobs:

- a **Segment** is a named structural passage whose accepted media can become one SemanticTake;
- a **Role Cue** says who speaks a turn without creating a character or choosing a voice;
- **Dual Text** gives one authored unit separate display and pronunciation text;
- `||` says that one on-screen **Caption Cue** hands off to the next after a complete Alignment Unit;
- a **word attribute** gives a Caption family an authored role on one displayed word;
- a **Selection** names a semantic range;
- a **Moment** names a semantic point.

```svml
<script id="story">
  <hook>
    <HOST> @claim! I made @proof <Hypit | hi pit> || work overnight @/proof.
  </hook>
</script>
```

Here the viewer reads `Hypit` while the performance says `hi pit`. The pair is one indivisible
Alignment Unit. `||` ends one on-screen Caption Cue after that unit and lets the next Cue begin with
`work`; `proof` remains one semantic range, and `claim` is a semantic point that other layers can use.

A Cue is a timed block of displayed speech, not a line of text. Its Caption family and Recipe may
wrap that block over one or more lines, reveal or highlight its words, and give the block an entrance,
exit or handoff. Segment boundaries, Role turns and Caption Style changes already separate Cues.
Use `||` when the same Segment, turn and Style still needs another deliberate reading handoff. The
[Caption craft](../playbooks/craft/captions.md#design-cue-rhythm-with-the-caption-system) owns how the
picture, language, family and Recipe shape that decision.

The author-facing forms are:

| Form | Meaning |
| --- | --- |
| `<opening>...</opening>` | A Segment named `opening`; all spoken prose belongs inside a Segment. |
| `<pause/>` | A self-closing Segment with identity and boundaries but no words. |
| `<HOST>` | A Role Cue inside the current Segment; it applies until another Role Cue or the Segment end. |
| `<display text \| spoken text>` | One Dual Text unit with separate visible and pronounced wording. |
| `< \| spoken text>` | Spoken words that keep semantic timing while contributing no visible Caption words. |
| `||` | A Caption Cue handoff between complete Alignment Units. |
| `word{emphasis,keyword}` | Boolean attributes on one complete display word for a Caption family to interpret. |
| `word{importance=2,tone=warm}` | Named string, number or boolean attribute values on that display word. |
| `@proof ... @/proof` | A Selection: one named semantic range. |
| `@claim!` | A Moment: one named semantic point. |

A Script contains one or more uniquely named lower-case Segments. A paired Segment carries prose;
the self-closing form carries a wordless passage. A Role Cue is a bare turn marker rather than a
paired element: the next Role Cue begins the next turn, and closing the Segment ends the final turn
and resets its Role. When a Segment uses Roles, place the first Role before that Segment's first
spoken text. One Segment can contain several Role turns without requiring several generated Takes.

Dual Text can contain several visible or spoken words on either side; its display side feeds Caption
and its spoken side feeds pronunciation. An empty display side intentionally omits those spoken words
from Caption while keeping them in the Narrative and semantic timing. Selections and Moments can be
placed on the spoken side because that side owns the speech anchors. Place Cue Breaks around the
complete Dual Text unit, not inside it. Attributes for a displayed Dual Text word belong on the
display side before the pipe. Inside that display side, use `\@` when the visible text itself needs an
at-sign.

Script comments use ordinary Markup comments outside the prose:

```svml
<!-- This note enters no text projection. -->
<social><HOST> Follow us \@hypit.</social>
```

Reserved Script punctuation remains literal when escaped: `\@` produces `@`, `\<` produces `<`,
`\{` produces `{`, `\}` produces `}`, `\|` produces `|`, and `\\` produces `\`. A plain `>` needs
no escape in ordinary prose; inside Dual Text, `\>` keeps it from closing that unit. A single `|` in
ordinary prose is literal; `||` is the Caption Cue handoff. Inside Dual Text, the first unescaped `|`
separates display from pronunciation; write `\|` for a literal pipe and `\|\|` for two literal pipes.
These escapes belong to Script prose, while structured Source attributes and elements use the Markup
escaping described in [Source syntax](../production/source-syntax.md).

Script derives speech tokens from words and numbers. Punctuation remains attached to the displayed
word it belongs with and does not create another speech time unit. CJK prose commonly contributes
one Han, Hiragana or Katakana character per lexical unit; compounds, decimal numbers and the spoken
side of Dual Text preserve their own lexical structure. This is why Cue breaks, word attributes and
semantic markers attach to complete authored units instead of punctuation or visual line positions.

## Use the Script's deliberate projections

One Script publishes the full Narrative and the narrow views needed by the rest of the work:

| Reference | What it carries |
| --- | --- |
| `{story}` | The complete authored Narrative. |
| `{story.segment.hook}` | The `hook` Segment as a NarrativeExcerpt for one SemanticTake. |
| `{story.segment.hook.dialogue}` | Role-aware dialogue using the spoken side of Dual Text, suitable for a speaking performance request. |
| `{story.segment.hook.speech}` | Pronunciation-only Text, suitable for `hypit measure` or independent speech. |
| `{story.caption}` | Display Words, Alignment Units, attributes, Roles, and authored Cue Breaks for Caption. |
| `{story.selection.proof}` | The named semantic range. |
| `{story.moment.claim}` | The named semantic point. |

These are projections of one authored Script, not copies to maintain. The performance request,
Caption system, and semantic timing therefore remain connected even when their visible and spoken
wording differ.

Script also represents passages without speech:

```svml
<script id="story">
  <empty></empty>
</script>
```

`empty` is an ordinary Segment name; a name such as `product-detail` can express the passage's role.
No words does not mean no semantics: the Segment retains its identity and start/end anchors. Its
associated normalized media determines the duration, and its SemanticTake has an empty word array.
The same SemanticTrack and Track timing vocabulary apply to a wordless passage or an entire
speech-free piece. The empty tag itself declares neither a zero-length interval nor a duration.

Choose Segment boundaries from natural production passages and delivery length, not from every
picture cut. One Segment and Take can carry several speaking turns, camera cuts or a split-screen
conversation. One continuous narration can carry many B-roll changes through Selections. Edited UGC
can deliberately use several Takes driven by the same character-and-scene image; a natural cut is
often part of its appeal. A Role change or `||` does not require another generation.

## Measure before choosing durations

For a new or revised A-roll performance, choose time from the target's words, delivery, and action.
The reference timeline remains useful for understanding rhythm and relationships; the new performance
establishes their actual timing. Even unchanged words may take a different amount of time with a new
speaker or delivery.

`hypit measure` is the creation-time command for `@hypit/estimate`. It counts pronunciation units and
estimates how many seconds they need at the chosen language and pace, using local computation:

```bash
hypit measure path/to/source.svml --segment opening --language en --pace normal
hypit measure --text "You expect me to type every coffee?" --language en --pace normal --rounding ceil
```

Use `--pace slow|normal|fast`, or `--rate` for pronunciation units per second; `--padding` adds time
for the intended pause or action. Keep related performances at a coherent delivery density. Initial
estimates can retain fractions with `--rounding none`. `ceil` rounds upward to a whole second, while
`round` chooses the nearest one. Most video requests use whole seconds; choose the final literal with
the selected model's supported values and the intended performance in mind.

Let that estimate inform the shape of the passage. A short line may belong with the next response,
benefit from a little fuller wording, or leave room for a meaningful action. A long passage may read
better with tighter copy or a split at a natural change of thought. Preserve the intended meaning and
energy while finding a performable shape, then measure the affected wording again. The
[Generated video direction](../playbooks/craft/video-direction.md#size-the-request-around-the-delivery)
applies this judgment to the selected model's request range.

Measurement balances the intended speaking density and sizes generation; it supplies no timeline
anchors. Once a Take is accepted, normalize it, align its actual speech to its Script Segment, and
assemble the resulting SemanticTakes into the SemanticTrack. The literal duration answers how much
media to request. The aligned words answer where Caption, B-roll, MG, and Effects belong in that actual
media. Alignment measures real word positions inside that media envelope; it does not reproduce an
estimated distribution of words.

For a wordless Segment, choose the requested duration from the action, music or visual rhythm.
Speech-rate measurement has no role there; the resulting media still determines its Segment span.

## Bind meaning to Script identities

For a picture, Caption treatment, MG state, sound, or effect that belongs to spoken meaning, author a
Selection or Moment and use the consuming component's Surface to project it through the SemanticTrack.
Use explicit seconds for genuinely clock-based or speechless design.

Selections may overlap, cross, or span Segments; they are named semantic ranges rather than nested
markup. Selection and Moment names share one namespace. Inside spoken text, each marker chooses an
adjacent semantic boundary:

| Marker | Boundary |
| --- | --- |
| `@name` | Open a Selection at the next word's start. |
| `~@name` | Open a Selection at the previous word's end. |
| `@/name` | Close a Selection at the previous word's end. |
| `@/name~` | Close a Selection at the next word's start. |
| `@name!` | Place a Moment at the next word's start. |
| `~@name!` | Place a Moment at the previous word's end. |

Markers may sit between or outside Segments when the meaning crosses structural passages. For
example, this Selection owns the complete Script program rather than borrowing the first and last
word boundaries:

```svml
~@whole
<opening><HOST>First thought.</opening>
<answer><HOST>Final answer.</answer>
@/whole~
```

At a Script or Segment edge, the corresponding structural boundary remains available even when
there is no neighboring word. Thus `@videos videos @/videos` covers exactly that word. For adjacent
B-roll windows that should also own the pause between words, choose which neighboring Selection
owns that gap through the explicit affinities; [B-roll craft](../playbooks/craft/b-roll.md) shows the
shared-boundary forms.

The consuming component's Surface projects the authored identity through the real SemanticTrack.
For example, `during={story.selection.proof}` on a visual Item makes that Surface construct the
resulting Window, while `at={story.moment.claim}` on an MG item or sound makes its Surface construct
the resulting Instant. The component's Fragment and Producers consume that value and own playback,
visible duration, animation, and state behavior; Script supplies the meaning and its Anchors.

Surfaces that expose Hypit's shared temporal vocabulary accept the forms appropriate to their role.
A Window occupies an interval:

| Form | Result |
| --- | --- |
| `during="program"` | The complete program Window. |
| `during={story.segment.hook}` | The Segment's Window. |
| `during={story.selection.proof}` | The Selection's Window, including its authored affinities. |
| `at={story.moment.claim} for="8f"` | A Window beginning at a Moment and lasting eight frames. |
| `until={story.moment.claim} for="250ms"` | A 250 ms Window ending at a Moment. |
| `start="program.start" end="moment.cue" moment={story.moment.claim}` | A Window composed from two explicit endpoints. |

Each Window uses one complete form. Explicit endpoint expressions can use `program.start`,
`program.end`, `selection.start`, `selection.end`, `segment.start`, `segment.end`, or `moment.cue`,
with the corresponding semantic reference supplied alongside it. They can also use a clock position
such as `1.5s` or an offset such as `selection.start - 2f`. Frames and milliseconds are integers;
seconds may be fractional.

An Instant names one point:

| Form | Result |
| --- | --- |
| `at={story.moment.claim}` | The authored Moment. |
| `at={story.selection.proof} boundary="start"` | The Selection's chosen boundary. |
| `at={story.segment.hook} boundary="end"` | The Segment's chosen boundary. |
| `instant="program.start + 8f"` | An explicit clock expression. |

A particular Surface may deliberately expose only some of these forms. Its vocabulary reports the
attributes it actually accepts; the shared spelling does not grant every component every temporal
behavior.

Reference archives keep original seconds and explain which original words or content events an item
serves. The target Source names the intended relation against the target Script. After the target's
actual audio is aligned, the SemanticTrack supplies its frames. Do not copy a reference timestamp into
the target or preserve an incidental lead/lag unless that offset itself is part of the design.

## Let the creation and production loops meet honestly

Timing seen in Studio or a real Result may expose one of several different problems. A wrong Cue or
semantic anchor changes Script. A sound performance that changes the intended rhythm may change the
duration choice or Treatment. A correct Selection rendered badly changes the component or Recipe. An
unusable generated Take changes its prompt, reference, Candidate, or shot design. Put each correction
where its fact is owned.
