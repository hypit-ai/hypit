# Caption craft

Captions are one program-wide interpretation of the authoritative Script, measured against the real
speech program. Do not create separate caption systems for speakers, regions, or styles.

## What is a caption is decided by the words, not by the styling

**Text that arrives with speech and reads exactly what is being said is a caption.** That is the
whole test, and it is checkable rather than a judgement: the words match the transcript verbatim, and
they appear as those words are spoken. A reference video's word-level transcript is prepared for
exactly this comparison.

Nothing about how it is drawn changes the answer. A caption may be set in two typefaces, sit on a
coloured slab, arrive a word at a time, be enormous, be decorative, or open the video — and it is
still a caption. Handsome styling is the commonest reason this gets misfiled, and it is not a reason
at all.

So it is authored with the caption vocabulary, driven by the Script and the alignment map. Never
reproduce it as `typo:` or `text:` with the words typed in by hand. That looks equivalent on the
first frame and is not: hand-typed words no longer follow the Script, so re-recording the line leaves
them stale, they are unreachable by anything that reasons about captions, and the identity that makes
them checkable is gone.

When the caption vocabulary cannot express the appearance, that is a vocabulary gap and it is
declared as one. Write a new project-local caption package that fills the same roles the installed
caption packages fill — Style, Program, planning and alignment — and drive it from the same Script
and map. `../../local-author-package.md` says where those roles are stated and when a package's own
source is worth opening. Reaching for a typography Track because it already draws the shape is the
mistake this section exists to prevent.

Text that is *not* a caption keeps its own vocabulary: a title nobody says, a lower third, a label on
a product, an editorial line that paraphrases rather than transcribes. The distinction is whether the
words are the spoken words.

## Author one caption pipeline

Use one deterministic pipeline for the program:

```text
exact font → caption-fine:Style → caption:Program
                                      +
                               speech.semantic
                                      ↓
                            caption-fine:Track
```

```svml
<fonts:Stack id="caption-font" family="inter" weight="700"
  style="normal" emoji="color"/>
<caption-fine:Style id="primary-caption"
  recipe={recipes.caption.primary} font={caption-font}/>

<caption:Program id="caption-program" document={story.caption} narrative={story}
  default={primary-caption}>
  <caption:Use role="HOST" style={host-caption}/>
  <caption:Use selection={story.selection.product}
    style={product-caption}/>
  <caption:Mute selection={story.selection.private}/>
</caption:Program>

<caption-fine:Track id="captions" document={story.caption}
  semantic={speech.semantic}
  program={caption-program}/>
```

Add `{captions.track}` to `film:Film` as one peer Visual Track. If the format intentionally has no
captions, omit the Caption components entirely.

## A Fine Caption Recipe writes eleven keys or it throws

`caption-fine:Style` requires `align`, `background`, `fill`, `line-height`, `padding`, `radius`,
`size`, `stack-order`, `width`, `x` and `y`. None of them has a fallback: a Recipe missing one is
refused when the Style decodes, before anything draws.

The three that get left out are the box keys — `background`, `padding` and `radius` — because a
design that wants no Cue box reads as having nothing to say about them. Write them anyway: an
invisible box is `background="#00000000"` with `padding` and `radius` at `0`, which is a value, not
an omission.

**`padding` is a string; `radius` and `size` are numbers.** `padding: 0` is refused with *Fine Caption
Recipe padding must be a string* while `radius: 0` beside it is correct, and the same holds for
`active-box-padding`. The reason is that padding admits a pair — `padding: "8 12"` is eight vertical
and twelve horizontal — which no JSON number can carry, so it travels as text and is split on the
space. A single value is still written as one: `padding: "0"`.

`cue-min-words` and `cue-max-words` are not read. `docs/quickstart/styles.md` and
`docs/quickstart/composition.md` still show them; a Recipe carrying either is refused as an unknown
property, since the Style admits exactly the required keys plus the documented optional ones.

## Cue boundaries are marked in the Script, with `||`

A Recipe holds no rule for where one Cue ends and the next begins. **The Script does**, as a `||`
between two complete Alignment Units — `docs/quickstart/script.md` is authoritative for it, and
`packages/script/src/parser.ts` reads it into the breaks the Caption Document carries.

```
<PRESENTER> It's generally good || at a lot of || different things, ||
  but it's not || as specialized || as some of these || other models.
```

A Segment with no `||` in it is **one Cue**, however long it is: the whole passage renders as a
single line and runs off both edges of the frame. That is the shape to recognise — a caption that
overflows is a Segment nobody broke, not a Style whose width or size is wrong, and widening the box
or shrinking the type will not close it.

Mark the breaks where the reference breaks. The observation for a shot says what is on screen at
once, and that is the Cue.

`||` cannot sit inside a Dual Text unit or split one, since a break falls between units and never
through one. Timing is not authored with it: each Cue is still timed from the alignment.

## Keep the Script authoritative

- Preserve the exact Script display text. Do not copy burned-in reference subtitles or rewrite the
  spoken source to match an existing visual caption.
- Use Dual Text when display and pronunciation differ. A Dual Text Alignment Unit is indivisible for
  timing; a Selection that cuts through it is rejected.
- Use `caption:Use role` for speaker-wide style and `caption:Use selection` for a semantic Selection's
  complete-unit projection. Ordered rules replace the complete Style, with the last matching rule
  winning.
- Use `caption:Mute` to hide complete Alignment Units without deleting Script words, changing speech,
  or regrouping Cues.
- Preserve original-language dialogue. Translation or alternate-language delivery is a separate
  authored Script decision, not a downstream model rewrite.

## Keep authoring separate from timing

- Script owns the CaptionDocument, including Display Words, N:M Alignment Units and authored `||`
  Cue Breaks.
- Caption projects Selections/Roles to complete units before it sees any frame or audio measurement.
- Each `whisperx:SemanticTake` measures one accepted normalized Segment take and packages its local
  timing; `speech:Track` assembles those Takes into the SemanticTrack used by `caption-fine:Track`.
- Recompute the affected SemanticTake whenever the speech audio changes. This holds for every Track
  timed against it — Caption, Media, Typography, Ranking, Deck, Comment, Screen, Audio — because each
  one is otherwise measured against audio that no longer exists, and the drift is invisible in a
  still frame.

## Design for readability

- Define one explicit default Style covering every Alignment Unit, then use only the overrides the story needs.
- Keep caption placement inside a safe region and clear of faces, products, device screens, buttons,
  and essential evidence.
- Use consistent font bytes, width, size, line height, Cue bounds, and padding when stable readability
  matters. Avoid decorative motion or active scaling that makes consecutive Cues appear unrelated.
- Short spoken phrases remain complete even when they cannot satisfy a preferred minimum word count.
  Never remove words merely to force a visual layout target.
- Treat captions and editorial overlays as separate Tracks with deliberate stack orders and spatial
  regions so they do not compete for the same area.

## Review the actual program

- Review the full delivery with real speech timing, not only a still frame or a structural plan.
- Verify every word, Role Style, muted unit, Cue boundary, timing window, line wrap, safe zone, and
  overlap with Media/Text Tracks.
- Listen while reviewing: a visually plausible Caption Track still fails if it leads or trails the
  actual spoken word.
