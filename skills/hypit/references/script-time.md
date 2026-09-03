# The program runs on the script's words, not on a clock

Every take is generated. It comes back at whatever length the model returned, and the SemanticTrack is
built from the words WhisperX finds inside it. So a number of seconds is never what a program is
authored against: the words are, and everything placed is bound to them.

Both routes reach this file. What differs is only where the temptation to use a clock comes from — a
reference video hands you a table of seconds, and a brief hands you a duration — and the answer is the
same either way.

## Mandatory Cue breaks for readable captions

Whenever a Segment will appear as captions or other spoken on-screen text, author explicit short Cues
with `||` between complete Alignment Units. As the default, cut every roughly 3–4 spoken words (fewer
for long words, large type, or dense designs); permit a longer Cue only when the reference clearly
holds it and the rendered bounds prove it fits. This is a hard layout requirement, not an optional
style preference: a Segment with no `||` becomes one Cue, and the entire long passage can render beyond
the screen. Do not depend on automatic wrapping, a larger box, or a smaller font to fix it. Choose
breaks at natural phrase or sentence boundaries, and never place `||` inside Dual Text or through an
N:M Alignment Unit. A closing `</segment>` is also a hard Cue boundary: Cue counting and timing
restart at the next Segment, so a trailing `||` is not required merely to prevent a Cue crossing
Segments.

The mechanical gate `validate_script_cues --run <build.svrun>` enforces a maximum of four visible
words per Cue. Fix the Script before `hypit check` or preview.

## A Segment is a stretch that is spoken as one

Cut the Script into Segments the way the program is *spoken*, not the way its pictures are numbered:
consecutive Segments carrying one unbroken voiceover are one Segment with Selections inside it.
`playbooks/craft/generated-dependencies.md` says why — a Segment is a generation boundary, and
splitting a stretch that is delivered unbroken invents a seam it does not have.

One thing does force a seam. The take that speaks a Segment generates that speech, so a Segment can
be no longer than one generation. Where an unbroken passage runs past what the model will produce in
one take, it becomes two Segments — and then the seam is yours to place rather than the ceiling's.
Put it where the speaker would draw breath: at a sentence end, never mid-clause.

## A take's duration is estimated

Every take is generated, and the generated speech plays at its own pace. So each take's duration comes
from `estimate:Speech` — the prediction of how long the generated line will be. Write that estimate on
the take.

Nothing depends on the estimate being exact. Script Selections bind every placed element to the
words, and the SemanticTrack places the words where the generated audio actually has them, so a
take that comes back a little long or short moves the words, not the bindings. This is also what
lets a program survive the author changing the lines: the estimate recomputes from the new
words. `estimate:Speech` takes `story.segment.NAME.speech`, so the duration follows the script it is
asked to predict.

## Bind covering content to the words, not to a frame

Bind covering content to a Script Selection over the words it covers — mark the range in the Script,
pass `semantic={speech.semantic}` to the Track, and use `during={story.selection.NAME}` — and let the
projection resolve the frames.

An Item bound to 3.25 seconds points at whichever word happens to land there, which is not the word
the number was copied from. One take returning half a second long moves every window after it.

Explicit `start`/`end` is for a program with no speech to anchor to.
`playbooks/craft/b-roll.md` reads that as a deliberate choice rather than a transcription.

## A system that spans pictures is authored once

- A visual system that persists across cuts — captions, a running list that keeps its state, a
  progress indicator, a persistent badge or logo, a recurring lower third — is one system: one
  Program, one Track and one shared Style over its full lifetime, even when the visible
  words, items or values change.
- Do not recreate the system per picture, and do not create a second Style because a new picture
  begins. A new picture is never itself evidence of a change in appearance.
- Author a local difference as a scoped variation inside the one system, on exactly the
  words, items or interval where it belongs.
- Whether the system is one Program with per-item timing or separate instances is decided by the
  declared vocabulary of the chosen package, never by how many pictures there are.
