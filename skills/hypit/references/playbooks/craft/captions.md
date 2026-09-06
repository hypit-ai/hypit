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

## Keep wording and timing in their owners

Script owns display words, speaking Roles, Dual Text units, attributes and `||` Cue Breaks. Its
CaptionDocument contains no seconds or frames. Caption joins that truth to the actual SemanticTrack;
a visual family then presents the timed units. Reuse those units rather than retyping spoken words
into independent Typography merely because it can draw the desired shape.

Use the produced performance's normalized and aligned audio. A change to that audio, its speed or
its cuts can change word timing and requires corresponding alignment. A visual-only restyle can
reuse the same semantic and media outputs through the Run.

## Start with the Fine family's real expressive range

The UGC, podcast and interview examples use `@hypit/caption-fine`. Fine supports exact fonts,
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

Fine's uniform-flow layout is a particular family. When the work needs new structural relationships
within a Cue, create a project Caption family consuming the common Caption data and semantic timing.
A new layout is normal component authorship. [Track authoring](../../production/track-authoring.md)
explains the boundary.

## Design reading rhythm with the picture

Break Cues at meaningful phrases, emphasis, speaker changes and the needs of the chosen visual
composition. `||` goes between complete Alignment Units and cannot split Dual Text. A short phrase
can stand alone; a longer readable Cue can be correct. Fine's line wrapping and word-per-line setting
are layout choices.

Choose font, size, width, line height, contrast and motion together. If a Cue overflows, inspect both
its authored grouping and its actual Style; do not assume every overflow has the same cause. Lead,
tail and handoff shape visibility while karaoke follows semantic word timing.

Treat Caption, icons, flashes and other graphics as a composition. The interview's guest color and
answer accents work together without coloring every system identically. Check readability across
light and dark frames, avoid hiding the important face or product, and allow enough space above a
tracked head for the whole Cue rather than only its anchor.

Use [Caption tracking](caption-tracking.md) for the produced-video → face boxes → head regions →
rerender loop. Fixed placement remains a valid design. Review the moving result with speech for
reading rhythm, Role assignment, cut transitions and visual collisions; a single styled frame is
not sufficient evidence of Caption timing.
