# Every instant has a picture, authored or not

A Source is written as a list of placements. A delivery is a picture at every frame. The two are not
the same shape, and the difference is where this whole class of defect lives.

Nothing is ever absent. An instant no Track covers is not blank — it is filled by whatever lies
beneath, and the viewer sees that with exactly the weight of everything that was chosen. Which wrong
thing appears is decided by what happened to be underneath: the Film's background, a layer placed
behind, the shot before. So one defect wears several faces — a black gap, a flash of the wrong picture, a panel that
blinks out and returns — and reading them as separate problems is how they get fixed one at a time,
for ever.

## Audit edges, not placements

Every interval has two edges. An edge you chose is an edit. **An edge you inherited is a hole**, and
an interval inherits its edges whenever its length comes from something other than your decision:

- a window derived from speech, which starts and stops with words and therefore excludes the silence
  around and between them;
- an insert, whose material ends where the generator stopped rather than where its window does — and
  then draws nothing for the rest of it, because `playback` defaults to `once-start`, so whatever it
  was covering is alone again mid-phrase. This is the one edge on the list a machine can find before a Build:
  `reconstruction_check` reads each Recipe and refuses the default on generated material.
  `generated-dependencies.md` says what to set instead. The Segment's own picture has no such edge —
  the take that speaks it is the take that draws it, so the two lengths are one number;
- a blend, whose frames are edges of partial coverage — a one-frame fade is one frame on which the
  layer beneath is half visible, and naming the Recipe for a cut does not make it one;
- a schedule inside a component, which draws only where its own Program says to and stops between.

The list is not the point and will never be complete. The question is, and it is the same question
every time: **for each edge, did I choose this instant, and what becomes visible on the other side of
it?** Anything derived answers "no" to the first half.

## Fix the interval; a layer underneath is not a repair

Putting something beneath a hole changes which wrong picture is shown. It does not close the hole,
and it makes the defect quieter rather than absent, which is harder to find. The interval is what has
to change: the window that ends early is lengthened, the material that runs out is replaced with
material that lasts, the stretch nothing claims is claimed by whatever the reference shows there.

**A stretch is moving footage unless the shot's own observation says its background is static.** That
is the default, and it is not a judgement to make from the Source or to measure off the reference:
the third visual question already asks whether the picture moves, and a held photograph or card that
only appears and disappears is still however long it is on screen. Read the answer for that shot. No
answer means moving.

Nothing that came out of an ffmpeg filter can stand in for that answer. A filter reads the whole
composited frame, so a reference whose background is frozen under a moving overlay measures as
moving, and one measured as moving proves nothing about the background — which is the only thing the
question is about.

So a still spanning the program is never right: it would need every shot's observation to say the
background is static. Neither is one held under a voiceover because the take beneath it was too
short — that stretch has a length, and the take is what has to reach it.

The picture that goes wrong this way reads as an edit rather than as a fault, and the reconstruction
looks finished while the same edges are still wrong. Nothing downstream catches it either: a still
has no timeline, so it takes no `playback` and the pre-Build check does not apply to it, and Gate 4
measures black, which a still removes.

The placeholders the comparison loop renders under an element never reach the Source. They exist in
that render and nowhere else — the Source never names them, and the checks that decide
coverage read the Source's Recipes and bindings rather than any picture. A mock cannot quiet a hole
it is structurally unable to reach.

## Measure it; the eye is the wrong instrument

Two of these are settled before a Build, from the Source alone, and neither needs a threshold.
Whether every word carries a picture is a yes or no per word: `reconstruction_check` reads which
full-frame elements bind which Selections and names the words nothing claims. Whether the material
lasts its window is the `playback` reading above.

What is left for the delivery is what only the delivery shows. An instant is a thirtieth of a second:
watching finds a scene that is wrong and slides straight past a frame that is, and the shorter the
hole the more it reads as intentional cutting. Both measurements are in `production-gates.md` Gate 4,
one for holes over nothing and one for holes over something. Run both — a hole with something under
it passes the first.

Anything the measurements report is an inherited edge. Take it back to the interval that produced it
rather than to the layer that revealed it.
