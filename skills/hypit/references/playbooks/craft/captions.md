# Caption craft

Caption displays the speech as it is being delivered. Its verbal identity and contemporaneous
relationship to that speech matter more than its size, decoration or placement. A striking animated
word can be Caption; a title held long after the phrase to label a section can be Typography even
when those words were also spoken. Their role in the work decides the distinction.

Script's Dual Text permits intentional display/pronunciation differences: “2012” and “twenty twelve”
remain one authored verbal unit. Caption does not require literal equality to a raw transcript.
Independent titles, lower thirds, labels and editorial paraphrases belong to their own Text or MG role.

For implementation of a new visual family, read
[Caption authoring](../../production/caption-authoring.md). That guide keeps the common text/timing
chain and shows where the new family owns scheduling and rendering.

## One data contract, three presentation layers

Script publishes one `CaptionDocument`: ordered display words, complete Alignment Units, speaking
Roles, word attributes and authored Cue handoffs. Caption joins it to the real SemanticTrack. That
common typed relationship is what makes the result Caption; an official renderer is not the
definition. A project package can provide another Caption family while keeping the same Script words
and measured speech evidence.

Direct the presentation through three related layers:

| Layer | What it decides |
| --- | --- |
| **Family** | The structural visual language and scheduling behavior the Caption can express: uniform flowing words, independently arranged phrases, speaker-attached shapes, or another authored relationship. |
| **Recipe and resolved Style** | One coherent treatment within that family. An SVS Recipe gathers a useful combination; the family's Style Surface resolves it with fonts or other explicit resources. Role or Selection applications can choose among those Styles. |
| **Parameters** | The individual decisions inside that treatment: placement and anchors, usable width, wrapping, typography, Paint and boxes, active-word response, Cue motion, reveal, lead, tail and handoff. |

The installed family vocabulary owns exact parameter names and accepted values. Craft owns how the
combination serves this picture and this reading rhythm. Keep a proven production treatment in its
project `.svs`; a set that has earned reuse across works can become an ordinary versioned data package
under its owner's scope. Such a collection preserves the family, Recipe and intended use together
rather than turning isolated parameter values into universal defaults.

## Keep wording and timing in their owners

Script owns display words, speaking Roles, Dual Text units, attributes and `||` Cue Breaks. Its
CaptionDocument contains no seconds or frames. Caption joins that truth to the actual SemanticTrack;
a visual family then presents the timed units. Reuse those units rather than retyping spoken words
into independent Typography merely because it can draw the desired shape.

Use the produced performance's normalized and aligned audio. A change to that audio, its speed or
its cuts can change word timing and requires corresponding alignment. A visual-only restyle can
reuse the same semantic and media outputs through the Run.

## Start with the Fine family's real expressive range

UGC, podcast and interview work can use `@hypit/caption-fine`. Fine supports exact fonts,
placement and anchors, wrapping, Cue boxes, active-word treatment, lead/tail and motion through
explicit Style Recipes. Role overrides can distinguish podcast hosts; a tracked head can supply a
moving placement point without changing the verbal pipeline.

```svml
<caption:Program id="caption-program" document={story.caption} narrative={story}
  default={primary-caption}>
  <caption:Use role="GUEST" style={guest-caption}/>
</caption:Program>
<caption-fine:Track id="captions" document={story.caption}
  semantic={speech.semantic} program={caption-program}/>
```

This excerpt assumes the imported Surfaces, fonts and Styles already declared in the Source.
Use the owning package README and `hypit vocabulary @hypit/caption-fine` for current Recipe fields.
Keep one coherent interpretation of the Script across speakers and styles; different colors do not
require unrelated transcripts or separately invented timing.

Fine's uniform-flow layout is a particular family and a useful broad implementation. When the work
needs new structural relationships within a Cue, create a project Caption family consuming the common
Caption data and semantic timing. Word attributes and semantic Selections can carry the authored roles
that family interprets; its own schedule and renderer can give those roles distinct arrangement and
animation. A new layout is normal component authorship. [Caption authoring](../../production/caption-authoring.md)
explains the boundary.

## Design Cue rhythm with the Caption system

A Cue is one timed block of displayed speech. Its family and Recipe determine what that block looks
like; Script's `||` determines an additional handoff between blocks inside the same Segment, speaking
turn and Style run. Those other boundaries already form new Cues. A visual line is different: Fine
may wrap one Cue over several lines without another `||`.

Choose the grouping from language and picture together. Let one Cue carry a coherent phrase or
thought that the viewer can grasp while still watching the performance. Preserve words whose meaning
depends on each other, and give a payoff or contrast its own handoff when the visual treatment makes
that separation useful. Keep a name, negation, article and noun, preposition and object, phrasal verb,
or quantity and unit together when separating them would make either screen state harder to read.

For the compact Fine treatments common in short-form UGC, begin with two to four displayed words per
Cue, or an equivalently brief reading unit in writing systems that do not separate words with spaces.
Count what Caption displays: the spoken side of Dual Text does not make the visual block longer. This
range is a strong drafting prior for a quickly handed-off, animated Caption; the actual language,
delivery, font, width, motion and Canvas decide the finished grouping. Let a tightly bound phrase run
longer when its meaning would suffer from another handoff.

With Fine's uniform-flow family, direct the common Cue to remain on one line by considering its
grouping together with the Recipe's font size, usable width and word gap. A stable line lets each
handoff replace one readable block without repeatedly changing the block's height and the viewer's
reading position. A Caption family designed around a two-line stack, an oversized keyword with a
supporting phrase, or another internal composition owns that relationship itself; its intentional
line structure is not a reason to add another `||`.

For example, a compact Fine treatment can begin with this phrase rhythm:

```svml
<explanation><HOST>
  One reference || can rebuild ||
  the shots and pacing, ||
  the captions and effects, ||
  around your product.
</explanation>
```

Its Cues contain two, two, four, four and three displayed words, while articles remain with their
nouns and each list pair stays intact. The same sentence can justify another grouping when a
different family makes a contrast, keyword or reaction the visual event. The sentence supplies
semantic structure; the chosen presentation says how much of that structure should share one screen
state.

Use Studio or a rendered interval to see the Cue with actual speech. Repeatedly flashing tiny groups
usually means the viewer is being asked to reacquire text too often; an overfull block usually means
the language, Recipe or family is asking one visual state to carry too much. Change `||` when the
reading unit is wrong. Change the Recipe when the reading unit is right but its size, wrap, placement
or motion is wrong. Change the family when the desired relationships cannot be expressed by that
family's structure.

Choose font, size, width, line height, contrast and motion together. If a Cue overflows, inspect both
its authored grouping and its actual Style; do not assume every overflow has the same cause. Lead,
tail and handoff shape visibility while karaoke follows semantic word timing.

Treat Caption, icons, flashes and other graphics as a composition. A guest color and answer accents
can work together without coloring every system identically. Check readability across
light and dark frames, avoid hiding the important face or product, and allow enough space above a
tracked head for the whole Cue rather than only its anchor.

Use [Caption tracking](caption-tracking.md) for the produced-video → face boxes → head regions →
rerender loop. Fixed placement remains a valid design. Review the moving result with speech for
reading rhythm, Role assignment, cut transitions and visual collisions; a single styled frame is
not sufficient evidence of Caption timing.
