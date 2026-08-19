# Street-interview format

Use one complete two-person street scene, two explicit Script Roles, and a microphone handoff to
make the active speaker readable without changing the location or camera topology.

## Author the SVML program

1. Write Script turns with explicit interviewer and guest Role Cues. Render the Kit dialogue so the
   interviewer is `A:` and the guest is `B:`.
2. Prepare one accepted final scene image containing both people, their full spatial relationship,
   the microphone, wardrobe, street context, camera height, and lens feel.
3. Prepare two clean voice references in the same order: audio 1 for A, audio 2 for B.
4. Vendor `street-interview-v1.svs`. Select `framing`, `edit-language`, `pacing`, `performance`,
   `reaction`, and `gesture` in an SVS Recipe.
5. For each Script Segment, use `copy:Render` with dialogue plus an optional English action slot,
   then call `seedance:ReferenceVideo generate-audio="true"` with the scene image and both voices.
6. Assemble the accepted Segment takes with `speech:Spine`, align the complete Script with
   `whisperx:Alignment`, then add Caption, Media, Typography, and Audio Tracks as needed.
7. Assemble peer Tracks in `film:Film`, render with `render:Video`, and use separate `.svrun`
   Sources with explicit Targets for review and delivery.

## Preserve the street-interview grammar

- Keep one locked or softly handheld two-person perspective. Small operator drift is natural; a new
  camera side, reconstructed street, or unrelated reaction angle is not.
- Only the active Role moves their mouth. The listener remains alive through eye focus, breath,
  posture, nods, and an appropriate silent reaction.
- A always holds the same microphone. On A lines it remains near A; on B lines A extends it toward B
  through a believable wrist/arm movement. The microphone must not duplicate or switch hands
  without an authored action.
- Let each answer complete one natural idea. Compact handoffs are useful, but intelligibility wins
  over speed.
- In the opening take, include about one second of silent surprise before the first authored line;
  budget it inside the generated duration and do not add unauthored words.

## Add proof and editorial layers

- Place B-roll and proof media with `media-track:Item` during Script Selections. Let the spoken setup
  begin before the picture enters and let the next spoken beat begin before the picture exits when a
  J-cut/L-cut improves continuity.
- Use the complete Caption chain with one program-wide Planner. Use `typo:Track` for titles, names,
  questions, or CTA copy.
- Keep exact signs, product labels, and device UI as supplied physical media. Do not ask Seedance to
  add editorial cards or captions.

The primary shared street shot does not need a reverse angle. If a device-facing or proof angle is
added, its opposing camera position must show a different background sector and landmark set from
the person-facing image.

## Review and reuse

Review speaker/voice assignment, lip-sync, microphone position, listener silence, identities,
street continuity, reaction timing, text hygiene, and caption placement. Pin accepted scene images
and takes with `.svrun` `build-record` and `satisfy` before downstream assembly.

Read `../craft/seedance-directing.md`, `../craft/visual-continuity.md`, `../craft/b-roll.md`, and
`../craft/captions.md`.
