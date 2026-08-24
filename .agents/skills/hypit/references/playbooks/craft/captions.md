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
declared as one. Write a new project-local caption package modelled on the installed caption
packages — read them as the pattern for Style, Program, planning and alignment — and drive it from
the same Script and map. Reaching for a typography Track because it already draws the shape is the
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
- Recompute the affected SemanticTake whenever the speech audio changes — `production-gates.md` Gate 3 states this for
  every Track that is timed against it, not only for captions. A Style-only change does not prove that
  a prior visual review is still valid.

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
