# Closing the loop on what was built

Structural checks prove that a source is legal. They prove nothing about whether it looks like the
reference. A newly written package can resolve, activate, decode and pass every check while drawing
something the reference never contained. Close that gap deliberately.

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
change — or when a remaining difference is explicitly recorded as an accepted deviation with its
reason. Passing `pnpm check` and `hypit check` is not convergence; it is the precondition for
starting the loop.

## The loop is bounded, and stopping is a decision you write down

A comparison that keeps finding something is not always a repair waiting to happen. A typeface the
generator cannot reproduce, a texture it will not hold, a grain that is simply not available — those
return a difference every round for ever. So the loop ends on whichever of these comes first.

- **Every attempt aims at a difference the comparison named.** Changing something the comparison did
  not mention is not an attempt; it is thrashing, and it does not earn one of the attempts below.
- **No progress ends it immediately.** If a comparison returns the same difference it returned before
  the repair, stop. The repair is not reaching the problem, and two more rounds of the same reasoning
  will not find it. Rendering and comparing cost real time on every round.
- **Two aimed attempts per element is the ceiling.** The first fixes what is obvious, the second
  fixes what the first revealed. A third round is where guessing starts to overshoot — correcting
  past the reference rather than towards it — and the run has more elements waiting than any one of
  them is worth. Time beats fidelity here by explicit choice.

## Measure what can be measured; iterate only on what cannot

Two attempts is not enough to converge by guessing, and it is not meant to be. A difference stated as
a quantity — a stroke that is too thick, a shape that is too tall, type that is too large, a margin
that is too wide — is not a guessing problem. Read the value off the reference frame directly:
the frames are ordinary images in `.hypit/reference-video-tools/<reference-id>/shots/`, and measuring
one against the known frame size gives the number in a single step.

Do that instead of spending an attempt. An attempt is for differences that have no number — a
typeface's character, a texture, a rhythm — where the only route is change it and look again.

When you stop with a difference still there, record it as an accepted deviation with what it is and
why it stayed. A difference nobody wrote down reads afterwards as a difference nobody noticed, and
the next person pays to rediscover it.
