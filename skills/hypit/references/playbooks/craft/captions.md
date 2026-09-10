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
For choosing Chinese, Latin or mixed-script faces, using a local font or finding a new one, read
[Fonts and text](../../production/fonts-and-text.md).

## Direct captions for this video

Use the reference to understand what its captions contribute: how they group speech, emphasize an
idea, establish a speaker or fit around the picture. Carry those relationships into the new work
when they serve its Brief. A new language, performer, product or tone can call for a different face,
grouping, placement or motion. Direct that treatment from the new Script's meaning and the video's
vibe, and record the choice in Treatment and its Recipe.

A short handoff can land a punchline; a longer phrase can let an explanation breathe. Both are useful
when the viewer can read the thought and follow the picture. The reference, language and intended
energy inform that judgment rather than prescribing a fixed Cue length or one caption look.

## Caption families, Styles and parameters

Script publishes one `CaptionDocument`: ordered display words, complete Alignment Units, speaking
Roles, word attributes and authored Cue handoffs. Caption joins it to the real SemanticTrack. That
common typed relationship is what makes the result Caption; an official renderer is not the
definition. A project package can provide another Caption family while keeping the same Script words
and measured speech evidence.

Direct the presentation through three related layers:

| Choice | What it decides |
| --- | --- |
| **Family** | The structural visual language and scheduling behavior the Caption can express: uniform flowing words, independently arranged phrases, speaker-attached shapes, or another authored relationship. |
| **Recipe and resolved Style** | One coherent treatment within that family. An SVS Recipe gathers a useful combination; the family's Style Surface resolves it with fonts or other explicit resources. Role or Selection applications can choose among those Styles. |
| **Parameters** | The individual decisions inside that treatment: placement and anchors, usable width, wrapping, typography, Paint and boxes, active-word response, Cue motion, reveal, lead, tail and handoff. |

The installed family vocabulary owns exact parameter names and accepted values. Craft owns how the
combination serves this picture and this reading rhythm. Keep a proven production treatment in its
project `.svs`; a set that has earned reuse across works can become an ordinary versioned data package
under its owner's scope. Such a collection preserves the family, Recipe and intended use together
rather than turning isolated parameter values into universal defaults.

Caption Program chooses where those Styles apply: a default, a speaking Role, a semantic passage or
a local emphasis. [Caption styling and coverage](../../production/caption-program.md) explains
overrides, Segment-wide selections, word attributes and hiding selected captions with Mute.

## Keep wording and timing in their owners

Script owns display words, speaking Roles, Dual Text units, attributes and `||` Cue Breaks. Its
CaptionDocument contains no seconds or frames. Caption joins that truth to the actual SemanticTrack;
a visual family then presents the timed units. Reuse those units rather than retyping spoken words
into independent Typography merely because it can draw the desired shape.

Use the produced performance's normalized and aligned audio. A change to that audio, its speed or
its cuts can change word timing and requires corresponding alignment. A visual-only restyle can
reuse the same semantic and media outputs through the Run.

## Reuse Fine or author a new family

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

Fine is to Caption what Media is to ordinary picture presentation: a broadly useful reusable
component. A new visual relationship can become a project component directly. A Caption family can
arrange a phrase around its keyword, place speakers' phrases in a shared composition, or coordinate
words and graphics as one visual event. Word attributes and Selections carry the authored meaning;
the family owns how that meaning appears and moves. This is ordinary video authorship, including for
a treatment used in only one work.

Apply the same freedom to component boundaries. Independently behaving captions can remain a peer
Track. Words and graphics whose layout or motion belongs together can share a component, consuming
the common Caption document and semantic timing. Caption names the relationship between displayed
speech and its performance; it does not prescribe a separate visual layer or the Fine renderer.
[Caption authoring](../../production/caption-authoring.md) explains building that family or scene.

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

### Language changes the reading unit

English commonly uses a word as its smallest timed display unit; Chinese uses individual Han
characters. That gives Chinese precise character highlighting, while a Cue still holds a meaningful
phrase. A Chinese Cue can comfortably contain more characters than an English Cue contains words.
Choose its length from meaning, reading time and the space the actual font occupies. A fixed word
or character count cannot make that choice. Count the display side of Dual Text when judging fit.

| Writing | Grouping and presentation |
| --- | --- |
| English | Keep a useful phrase together, including its articles, negation and name or quantity. Word lengths vary, so the chosen face and width matter more than a word count. |
| Chinese | Keep compounds, names, modifiers and their objects together. Let a complete short clause share a Cue when it fits; repeated tiny character groups fragment both meaning and the screen. |
| Mixed Chinese and English | Read the phrase as a whole. A Latin brand name or number can occupy several Han characters' width; its lexical unit count does not predict that width. |

Fine already leaves adjacent Han characters together without English word gaps. Its `word-gap`
controls spaced boundaries, including Chinese/Latin transitions; `letter-spacing` adjusts tracking.
The same timing supports a stable complete Cue, current-character color or a trail. For flowing
Chinese speech, a readable phrase with restrained emphasis often works better than a separate bounce
or reveal on every character. Choose the response for the performance's energy.

For whole-character highlighting, use `karaoke: current` with `karaoke-transition: step`.
Choose `trail` instead of `current` when the already spoken characters should stay highlighted.
`step` activates the complete timed unit at its start; `wipe` is a different visual choice that
sweeps inside its glyphs. Both follow each unit's own speech time, including uneven delivery and
pauses. Making a Cue longer changes its reading group, not its character timing.

Text appearing and text changing color are separate choices. `atom-reveal: all` keeps the complete
Cue available to read while Karaoke supplies emphasis; `on-start` reveals whole spoken units, and
`typewriter` reveals whole graphemes within them. A pronunciation span such as `<Hypit|Hai-Pit>`
remains one shared timing unit. Scope it to the expression needing a pronunciation hint so the
surrounding Chinese characters retain their own timing.

With Fine's uniform-flow family, direct the common Cue to remain on one line by considering its
grouping together with the Recipe's font size, usable width and word gap. A stable line lets each
handoff replace one readable block without repeatedly changing the block's height and the viewer's
reading position. A Caption family designed around a two-line stack, an oversized keyword with a
supporting phrase, or another internal composition owns that relationship itself; its intentional
line structure is not a reason to add another `||`.

For example, these groupings preserve short ideas in each language:

```svml
<explanation><HOST>
  One reference can rebuild ||
  the shots and pacing, ||
  the captions and effects, ||
  around your product.
</explanation>

<explanation-zh><HOST>
  一张参考图 || 就能重新设计镜头和节奏，||
  让字幕和特效 || 为你的产品服务。
</explanation-zh>
```

These are alternative Script excerpts, not a bilingual performance. Another width or delivery can
justify a different handoff. The sentence supplies semantic structure; the presentation says how
much of that structure should share one screen state.

Fine's optional `max-words-per-line` inserts visual line breaks by display-unit count. In Chinese,
that count is usually characters. Leave it unset for ordinary width-based flow; choose it when a
deliberate counted row serves the design. `max-lines` checks those counted rows and requires that
setting; it does not make a long Cue fit one physical line. The package README owns these controls.

Use Studio or a rendered interval to see the Cue with actual speech. Repeatedly flashing tiny groups
usually means the viewer is being asked to reacquire text too often; an overfull block usually means
the language, Recipe or family is asking one visual state to carry too much. Change `||` when the
reading unit is wrong. Change the Recipe when the reading unit is right but its size, wrap, placement
or motion is wrong. Change the family when the desired relationships cannot be expressed by that
family's structure.

Choose font, size, width, line height, contrast and motion together. If a Cue overflows, inspect both
its authored grouping and its actual Style; do not assume every overflow has the same cause. Lead,
tail and handoff shape visibility while karaoke follows semantic word timing.

Judge weight and outline from the actual glyphs. Dense Han characters need their internal spaces to
stay open; a heavy Latin-caption outline can overwhelm them. A clear face with a modest outline or
compact shadow can separate speech from a busy picture while preserving the letterforms. Changing
the language calls for reconsidering the treatment, not merely replacing the text in an English Recipe.

Treat Caption, icons, flashes and other graphics as a composition. A guest color and answer accents
can work together without coloring every system identically. Check readability across
light and dark frames, avoid hiding the important face or product, and allow enough space above a
tracked head for the whole Cue rather than only its anchor.

Use [Caption tracking](caption-tracking.md) for the produced-video → face boxes → head regions →
rerender loop. Fixed placement remains a valid design. Review the moving result with speech for
reading rhythm, Role assignment, cut transitions and visual collisions; a single styled frame is
not sufficient evidence of Caption timing.
