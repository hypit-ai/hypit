# Talking-head format

Use one recurring presenter identity for a sequence of direct-to-camera speech takes, then add
captions, B-roll, and editorial typography as peer Tracks.

## Author the SVML program

1. Write one Script with a strong opening Segment and 2–3 following Segments for context, evidence,
   mechanism, payoff, or CTA. Keep each generated speaking take inside the selected model's declared range; 8–12 seconds is
   a useful target when the delivery remains natural.
2. Run `hypit measure` for each Segment before generation and write the literal durations.
3. Vendor `speaker-v1.svs`. Put stable `composition-stability`, `camera-motion`, `edit-rhythm`,
   `performance`, and `gesture` choices in an SVS Recipe.
4. Render each take prompt with `copy:Render`; connect the Segment dialogue and one short English
   action direction through `copy:Set`.
5. Generate each take with `seedance:ReferenceVideo generate-audio="true"`, one accepted full
   presenter/scene image, and the intended voice reference. Keep reference order identical across
   the shot group.
6. Normalize each accepted take, create one `whisperx:SemanticTake` from that media and its Script
   Segment, then assemble those Semantic Takes in Script order with `speech:Track`.
7. Add the exact-font Caption chain when captions are wanted: `caption-fine:Style` →
   Script-owned `CaptionDocument`/`caption:Program` → `caption-fine:Track`.
8. Add B-roll through `media-track:Track`, editorial copy through `typo:Track`, then assemble with
   `film:Film` and render with `render:Video`.

## Direct the presenter

- Keep face, apparent age, hair, wardrobe, room, light direction, lens feel, and framing envelope
  stable across A-roll.
- Put spoken words only in the Script-derived dialogue slot. Put visible performance in the action
  slot: gaze changes, brows, nods, compact gestures, posture, breath, or one motivated object action.
- Let each Segment finish one thought. Do not fragment a sentence merely to manufacture more cuts.
- Keep hands inside the established frame and away from the face unless contact is the authored
  action. Preserve every prop's count, support, label, and starting position.
- Use B-roll for a genuine change of place, proof, mechanism, or emotional state. Do not make the
  presenter identity drift to create variety.

## Handle screens and reverse views

When the presenter-facing shot is paired with a device-facing proof shot, define both camera
positions before generating either image. The two opposing views must show different background
sectors and different dominant landmark sets. Reusing the same wall, window, or furniture group is
an automatic rejection. Preserve the same room, presenter, device, lighting logic, and eye line.

Use supplied UI media whenever exact interface content matters. Keep explanatory text on
`typo:Track`, not inside the generated shot.

## Review and reuse

- Review the full-resolution presenter image before any speaking take.
- Review every A-roll take for identity, lip-sync, exact words, voice assignment, stable background,
  hands, props, and generated text.
- Review B-roll independently, then review the joined Film for pacing, semantic timing, caption
  collisions, and audio clarity.
- Pin every accepted image and take in the next Build with `.svrun` `build-record` and `satisfy`.

Read `../craft/image-prompt-style.md`, `../craft/seedance-directing.md`,
`../craft/persona-and-audio.md`, `../craft/captions.md`, `../craft/b-roll.md`, and
`../craft/overlays.md`.

That list is complete, and the always-read craft in `../index.md` applies regardless of format.
