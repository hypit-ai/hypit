# Closing the loop on what was built

Structural checks prove that a source is legal. They prove nothing about whether it looks like the
reference. A newly written package can resolve, activate, decode and pass every check while drawing
something the reference never contained. Close that gap deliberately.

## The reference side is finished

The reference video does not change. Its observations are cached and authoritative. Re-observing at a
fixed temperature of `1.0` buys paraphrase drift and another bill, so never re-run a completed
observation to "check" it. `--reobserve` exists for a shot whose media was rebuilt, not for doubt.

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
