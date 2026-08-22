# Every instant has a picture, authored or not

A Source is written as a list of placements. A delivery is a picture at every frame. The two are not
the same shape, and the difference is where this whole class of defect lives.

Nothing is ever absent. An instant no Track covers is not blank — it is filled by whatever lies
beneath, and the viewer sees that with exactly the weight of everything that was chosen. Which wrong
thing appears is decided by what happened to be underneath: the Film's background, a bed, the shot
before. So one defect wears several faces — a black gap, a flash of the wrong picture, a panel that
blinks out and returns — and reading them as separate problems is how they get fixed one at a time,
for ever.

## Audit edges, not placements

Every interval has two edges. An edge you chose is an edit. **An edge you inherited is a hole**, and
an interval inherits its edges whenever its length comes from something other than your decision:

- a window derived from speech, which starts and stops with words and therefore excludes the silence
  around and between them;
- a generated take, which ends where its material ends rather than where the shot should — and then
  draws nothing for the rest of its window, because `playback` defaults to `once-start`. This is the
  one edge on the list a machine can find before a Build: `reconstruction_check` reads each Recipe
  and refuses the default on timed generated material. `generated-dependencies.md` says what to set
  instead;
- a blend, whose frames are edges of partial coverage — a one-frame fade is one frame on which the
  layer beneath is half visible, and naming the Recipe for a cut does not make it one;
- a schedule inside a component, which draws only where its own Program says to and stops between.

The list is not the point and will never be complete. The question is, and it is the same question
every time: **for each edge, did I choose this instant, and what becomes visible on the other side of
it?** Anything derived answers "no" to the first half.

## A layer underneath is a safety net, not a repair

Putting something beneath a hole changes which wrong picture is shown; it does not close the hole.
That is worth doing — a held still under a voiceover beats black — but it makes the defect quieter
rather than absent, and quieter is harder to find. Fix the interval. Keep the bed for the frames no
interval should have to claim.

This matters most right after a fix: closing a black gap by bedding a layer under it converts a
symptom everyone can see into one that reads as an edit, and the reconstruction looks finished while
the same edges are still wrong.

The placeholders the comparison loop renders under an element are not beds and cannot become one.
They exist in that render and nowhere else — the Source never names them, and the checks that decide
coverage read the Source's Recipes and bindings rather than any picture. A mock cannot quiet a hole
it is structurally unable to reach.

## Measure it; the eye is the wrong instrument

An instant is a thirtieth of a second. Watching finds a scene that is wrong and slides straight past
a frame that is, and the shorter the hole the more it reads as intentional cutting. Both measurements
are in `production-gates.md` Gate 4: one for holes over nothing, one for holes over something. Run
both, because passing the first is exactly what bedding a layer buys.

Anything the measurements report is an inherited edge. Take it back to the interval that produced it
rather than to the layer that revealed it.
