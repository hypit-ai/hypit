# Overlay craft

An overlay should add information the photographed or generated base does not already communicate.
Keep every overlay as an explicit peer Track with its own content, placement, timing, appearance, and
stack order.

## Give every overlay one job

- Use an overlay to name, emphasize, compare, direct attention, or add necessary context. Remove any
  layer whose only function is decoration.
- Keep copy short enough to read in one scan. Put explanations in speech or captions rather than a
  second paragraph inside a badge or lower third.
- Present related title, label, icon, and card elements as one clear hierarchy on the same story beat.
- Use a small stable visual vocabulary. Color, size, border, paint, and motion should express hierarchy,
  not random variation.
- Keep base-generation prompts free of editorial captions, arrows, cards, floating logos, and UI
  callouts. Author those elements separately.

## A covering overlay decides how the base is framed

An overlay that holds a fixed region of the frame for a long stretch — a tier board across the bottom
half, a leaderboard band, a scoreboard, a full-width lower third, a screenshot filling the top half —
takes that region away from the picture underneath. The base has to be generated for the frame that
is left, not for the whole one.

- Work out which region the overlay covers before writing the base prompt, and frame the subject
  clear of it: a strip owning everything below 51% of the height means the speaker's head, face and
  shoulders sit **above** the midline, not centred in the whole frame.
- Say it as positive geometry in the prompt — where the eyes fall, where the shoulders end, what is
  in the part the overlay will cover. Never name the overlay itself; a generator told about a graphic
  draws one.
- The same applies to a persistent overlay at the top: a sheet covering the upper half pushes the
  subject down, and a base framed for it looks wrong the moment the overlay leaves. If one shot is
  covered at the top and another at the bottom, those are different framings and therefore different
  images, not one image used twice.
- A face, a mouth or a gesturing hand behind an opaque overlay is the failure this prevents, and it
  survives every structural check: the Source is legal, both tracks build, and the speaker is
  headless. Place the overlay so the base picture's face, mouth and hands stay clear of it, and
  author the base picture's framing to leave that clearance.

## Choose the native overlay surface

Use `typo:Track` for editable typography:

- declare exact font bytes with `fonts:Stack` or `media:Font`;
- compile appearance with `typo:Style` and an SVS Recipe;
- choose `typo:Point`, `typo:Area`, or `typo:Path` according to the intended geometry;
- put reusable plain copy in `copy:Value` and connect it through `content={copy}`.

Use `media-track:Track` for images, generated/supplied video, prepared media, or an already-authored
compositable surface:

- place every Item in an explicit `space:Frame`;
- select one source form: `image` with `extent`, `video`, `media`, or `surface`;
- keep fitting, clipping, frame paint, border, shadow, and lifecycle motion in SVS Recipes;
- use ordered Layers for a deliberate composite and `media-track:Sequence` for changing visual states.

Changing or scrolling content must remain explicit. Author distinct timed Text/Media Items or a
Sequence for each state; do not bake several states into one generated image.

When the overlay is a *picture within the picture* — the base must stay dominant and a smaller
framed image, a cutout, or a video sits on top of it — read `pip-overlay.md`. It is a specific
craft: the source forms (a rectangular `media-track:Item`, a `remove:Background` cutout, a
`compose:Image` freeze) are a chain rather than alternatives, and placement, appearance and cutout
edges are inspected. A PIP is not an ordinary overlay and is not covered by this file alone.

## Bind overlays to story time

- Pass `semantic={speech.semantic}` to the Track and use `during={story.selection.NAME}` for a
  semantic range.
- Use `at={story.moment.NAME}` with an explicit `for` duration for a point event.
- Use `during="program"` for persistent overlays and explicit `start`/`end` expressions for deliberate
  author-time placement.
- Author another named Selection and overlay item when the same effect should repeat later.
- Let an overlay appear when the information is actually spoken or visible, and leave enough time to
  read it. Do not place important copy only in the final instant of a shot.

## Preserve source truth

- Use supplied screenshots, charts, finished graphics, logos, and alpha artwork as media when their
  exact appearance matters.
- Keep editable text as Text, not rasterized generator output.
- Preserve alignment across related frames. Left, center, or right anchoring is a continuity decision,
  not an incidental per-frame choice.
- Keep overlays clear of captions, faces, product labels, key UI, gestures, and the base shot's main
  evidence. Resolve collisions by moving or simplifying the overlay before reducing readability.

## Review overlays in motion

- Watch the full sequence to evaluate entry timing, reading time, hierarchy, transition rhythm, and
  exit timing; a still image cannot validate these properties.
- Check every overlay both with captions present and with the surrounding Media Tracks visible.
- When the screen feels crowded, remove information before accelerating animations or shrinking type.
- Verify the final `film:Film` stack order. Higher recipe `stack-order` values render above lower ones,
  so accidental ordering can hide otherwise correct content.
