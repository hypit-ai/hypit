# Scenario-call format

Use two final video-call states: A in the main tile with B inset, and B in the main tile with A
inset. Both tiles remain live while the active speaker changes.

## Author the SVML program

1. Write explicit A/B Script turns and prepare two clean voice references in that order.
2. Prepare two accepted call-layout images. Image 1 is A-main/B-inset; image 2 is B-main/A-inset.
   Preserve both identities, local rooms, wardrobe, webcam perspective, borders, controls, crop, and
   tile geometry.
3. Vendor `call-v1.svs`. Select `framing`, `edit-language`, `pacing`, `performance`, `reaction`, and
   `gesture` in an SVS Recipe.
4. Render each Segment with `copy:Render`; connect Script dialogue and optional English action
   direction through `copy:Set`.
5. Generate each take with `seedance:ReferenceVideo generate-audio="true"`, the two layout images,
   and the two ordered voice references.
6. Normalize each take, produce its `whisperx:SemanticTake`, assemble the results with
   `speech:Track`, then add the exact-font Caption chain, Typography, Media, and Audio Tracks.
7. Assemble in `film:Film`, render with `render:Video`, and stage review/delivery in `.svrun`.

## Preserve call-state truth

- Main and inset geometry must exchange roles exactly; the layout may not drift between states.
- A's local background remains A's background whether A is main or inset. The same rule applies to B.
  These are two live feeds changing layout, not two physical cameras reversing inside one room.
- Only the active speaker moves their mouth. The listener remains live through gaze, breath, posture,
  and silent reaction; do not freeze the inset into a portrait.
- Keep interface controls, borders, labels, and notification states supplied by the accepted layout
  media. Seedance should preserve them, not invent new messages, captions, or badges.
- Use `typo:Track` for editorial labels or explanations that sit outside the physical call UI.

## Review and reuse

Review the two layout references side by side for exact main/inset exchange, participant/background
identity, crop, controls, and aspect ratio. Review each take for speaker/voice assignment, lip-sync,
live listener reaction, UI stability, and generated text. Pin every accepted layout and take with
`.svrun` `build-record` and `satisfy`.

Read `../craft/seedance-directing.md`, `../craft/captions.md`, `../craft/overlays.md`, and
`../craft/voice-and-performance.md`.

That list is complete, and the always-read craft in `../index.md` applies regardless of format.
