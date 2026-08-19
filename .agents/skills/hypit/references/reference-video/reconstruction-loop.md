# Closing the loop on what was built

Structural checks prove that a source is legal. They prove nothing about whether it looks like the
reference. A newly written package can resolve, activate, decode and pass every check while drawing
something the reference never contained. Close that gap deliberately.

This loop is about how an element *looks* against the reference, and it is bounded. Whether an
element *builds at all* is a different gate with a different rule: `preview-check` (in
`final-sources.md`) must pass with no failures before this loop is even reached, and its failures are
repaired until they pass without any attempt ceiling. A build failure is not a difference to weigh;
it is work that is not done.

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

The SVML Playground in `../preview.md` is a browser preview for a person to look at. It is not a
source of the image this loop needs.

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
a margin that is too wide — is not a guessing problem. Read the value off the reference frame
directly:
the frames are ordinary images in `.hypit/reference-video-tools/<reference-id>/shots/`, and measuring
one against the known frame size gives the number in a single step.

Do that instead of spending an attempt. An attempt is for differences that have no number — a
typeface's character, a texture, a rhythm — where the only route is change it and look again.

Stopping is the end, and the end carries no final comparison. When the attempts are spent the loop
stops as it is: the second repair is the last thing the observer saw, and there is no third
comparison to name what remains. Do not spend one to find out — a comparison that changes nothing
and exists only to report the gap is a paid step for a report nobody asked for. The element is what
it is; move on to the next one.
