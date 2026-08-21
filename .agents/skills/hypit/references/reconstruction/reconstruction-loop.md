# Closing the loop on what was built

Structural checks prove that a source is legal. They prove nothing about whether it looks like the
reference. A newly written package can resolve, activate, decode and pass every check while drawing
something the reference never contained. Close that gap deliberately.

This loop is about how an element *looks* against the reference, and it is bounded. Whether an
element is *wired at all* is a different gate with a different rule: `preview-check` (in
`../preview.md`) must pass before this loop is even reached, and its failures are repaired
without any attempt ceiling. A graph that does not trace is not a difference to weigh; it is work
that is not done.

Note what that gate covers: `preview-check` proves the graph is wired, not that every track draws.
Nothing is handed to a Producer until the Build runs, so a Producer that refuses the media it
receives surfaces there rather than here.

The difference between the two gates is what each reports. `preview-check` names the graph failure —
the target that does not trace, the chain that is missing — so its repairs are not guessing. This
loop names the appearance difference: `compare_reconstruction` sends the rendered element and the
reference frame to Gemini and returns what differs in words, and a repair aims at a difference the
comparison named. Neither gate expects the agent to guess; each one tells you what is wrong, and you
repair that.

## The reference side is finished

The reference video does not change, and its observations are cached. Re-observing at a fixed
temperature of `1.0` buys paraphrase drift and another bill, so never re-run a completed observation
to "check" it. `--reobserve` exists for a shot whose media was rebuilt, not for doubt.

Cached does not mean correct. The authority on the reference side is the frame, not the prose written
about it — `workflow.md` says when to go and look, and doubt is settled there, for free, rather than
by paying for a second description.

Everything in this file happens on the reconstruction side, which changes every time a package,
Recipe or source edge is edited.

## The loop unit is one element

Loop over one reconstructed element at a time — the new component, one caption system, one inserted
card:

1. Render that element to a still image locally, without a paid Provider. A new package's visual
   Surface needs a preview image anyway, as `../local-author-package.md` requires. The repository's
   own visual test `packages/hyperframes/test/browser-visual.test.ts` shows the local path end to
   end: build the Track, compile the HyperFrames document, and render it through the local
   HyperFrames Runtime.
2. Compare it against the reference frame that shows it most clearly:
   `.hypit/reference-video-tools/<reference-id>/shots/NNN-representative.jpg`.
3. Repair, then render again.

### One observer reads the reference, and it is the one the reference was prepared with

`compare_reconstruction` is how the reference frame is looked at, and `observers.md` says who looks.
The reference has one observer for its whole life, and the comparison goes through the same one that
wrote its observations.

**On the `gemini` observer, that observer is not you.** The command sends the reference frame and the
rendered image as an unlabelled pair and returns the differences in words. Do not open the reference
frame yourself and look at it, whatever visual ability the model running this loop has, and do not
look at the rendered reconstruction either. A second observer is a second opinion paid for with the
very bias it claims to correct: it sees the reconstruction, knows what was built, and confirms what it
expects. This is why a font that is wrong is caught — the comparison names it, and the package is
repaired, rather than a font being chosen because it resembles what you remember.

**On the `agent` observer the command returns the two images and the question instead of an answer,
and who looks at them is up to the harness.** Give them to a subagent when you can: one handed two
unlabelled images and the question knows neither which is the reference nor what was built, which is
the same blindness this section rests on. Answer it yourself only when there are no subagents, and
then the bias above is real, so `observers.md` states the discipline that stands in for blindness —
write the differences down before naming a cause, count only repairs aimed at a difference you wrote
down, and read a quantity off the frame rather than spending an attempt guessing at it.

Hypit Studio is a browser preview for a person to look at. It is not a source of the image this
loop needs: that image is the local still render in `../preview.md`, which draws one element without
a Provider.

Repairing one element never re-runs the others. Do not rebuild the whole video to inspect one piece,
and do not defer every comparison to a final delivery Build.

## Comparison is blind

Use `compare_reconstruction --reference-id <id> --shot-id <id> --image <rendered.png>`.

- Never tell the observer which image is the reconstruction, what was built, which component drew it,
  or what you expect to be wrong. An observer told what to confirm will confirm it.
- The only permitted extra input is scope, through `--question`: which region of the picture to look
  at, and nothing else.
- Results are not cached. Every iteration is a fresh comparison.

## Repair in dependency order

When the difference is structural rather than cosmetic, repair in the order given by
`../local-author-package.md`: package and workspace resolution, activation contribution, Manifest,
Producer, Type and Validator agreement, Surface vocabulary and decoding, implementation behaviour,
then source usage. Fixing source usage over a broken implementation hides the defect one layer down.

## Converged means the differences are wording

Stop when the returned differences are wording-level — a describer's phrasing rather than a visible
change. Passing `pnpm check` and `hypit check` is not convergence; it is the precondition for
starting the loop.

## The loop is bounded, and stopping is the end

A comparison that keeps finding something is not always a repair waiting to happen. A typeface the
generator cannot reproduce, a texture it will not hold, a grain that is simply not available — those
return a difference every round for ever. So the loop ends on whichever of these comes first.

- **Every attempt aims at a difference the comparison named.** Changing something the comparison did
  not mention is not an attempt; it is thrashing, and it does not earn one of the attempts below.
- **No progress ends it immediately.** If a comparison returns the same difference it returned before
  the repair, stop. The repair is not reaching the problem, and two more rounds of the same reasoning
  will not find it. Rendering and comparing cost real time on every round.
- **There are two loops, each with its own two-attempt ceiling.** The first loop is over the
  *package*: render what it draws and compare it; a difference that the package cannot express is a
  package defect, and fixing it means changing the package's structure. The second loop is over the
  *values*: once the package can express everything the observation states, tune the Recipe, the
  font, the placement and the motion until it looks like the reference. The two never share attempts.

  **Write-and-remake the package: two attempts.** The first fixes what is obvious, the second fixes
  what the first revealed. If after two repairs the difference is still one the package cannot
  express — a typeface mix it has no port for, a motion it cannot draw — the package is wrong, not
  the values, and continuing to tune values is thrashing. Widen the package instead, which starts a
  fresh write-and-remake loop for the widened shape.

  **Fill the parameters: two attempts.** A difference the package *can* express — the wrong weight,
  the wrong size, the wrong colour, the wrong position — is a value, and tuning it is the second
  loop. Two attempts, then stop.

  Beyond each ceiling, guesses start to overshoot — correcting past the reference rather than
  towards it. Time beats fidelity here by explicit choice.

## Measure what can be measured; iterate only on what cannot

Two attempts per loop is not enough to converge by guessing, and it is not meant to be. A difference
stated as a quantity — a stroke that is too thick, a shape that is too tall, type that is too large,
a margin that is too wide — is not a guessing problem. Ask for the number: a
`compare_reconstruction --question "how tall is the oval relative to the frame?"` over the shot that
shows it most clearly returns a measurement in one step, from whichever observer the reference holds.

Do that instead of spending an attempt. An attempt is for differences that have no number — a
typeface's character, a texture, a rhythm — where the only route is change it and look again.

Stopping is the end, and the end carries no final comparison. When the attempts are spent the loop
stops as it is: the second repair is the last thing the observer saw, and there is no third
comparison to name what remains. Do not spend one to find out — a comparison that changes nothing
and exists only to report the gap is a paid step for a report nobody asked for. The element is what
it is; move on to the next one.

When there is no next element the reconstruction is complete, and two things follow it.

If the author wants the result to differ from the reference — their presenter, their product, their
brand — read the sources you wrote and change them to what they asked for. `index.md` says why that
happens here rather than earlier.

If a project-local package was built along the way, decide whether it should outlive this video and
put that to the author: `../local-author-package.md` says how to judge it and what promoting it
actually costs.
