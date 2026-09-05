# Street-interview format

Use explicit interviewer, guest and shared street views, two Script Roles, and a microphone handoff.
Write camera changes and performance together in each take's action, in the order they occur.

## Author the SVML program

1. Write Script turns with explicit interviewer and guest Role Cues. Render the Kit dialogue so the
   interviewer is `A:` and the guest is `B:`.
2. Prepare three accepted final views in order: image 1 for interviewer A, image 2 for guest B, and
   image 3 for their shared scene and full spatial relationship.
3. Prepare two clean voice references in the same order: audio 1 for A, audio 2 for B.
4. Vendor `street-interview-v1.svs`. Select `framing`, `pacing`, `performance`, `reaction`, and
   `gesture` in an SVS Recipe.
5. For each Script Segment, use `copy:Render` with dialogue plus an English action that states the
   camera and performance sequence directly, then call `seedance:ReferenceVideo
   generate-audio="true"` with all three views and both voices.
6. Normalize each accepted Segment take, produce its `whisperx:SemanticTake`, assemble the results
   with `speech:Track`, then add Caption, Media, Typography, and Audio Tracks as needed.
7. Assemble peer Tracks in `film:Film`, render with `render:Video`, and use separate `.svrun`
   Sources with explicit Targets for review and delivery.

## Preserve the street-interview grammar

- Select the shared, interviewer or guest reference directly in the action whenever the camera
  changes. Preserve the authored camera side, background sector and spatial relationship of the
  selected view.
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

## Review and reuse

Review speaker/voice assignment, lip-sync, microphone position, listener silence, identities,
street continuity, reaction timing, text hygiene, and caption placement. Pin accepted scene images
and takes with `.svrun` `build-record` and `satisfy` before downstream assembly.

Read `../craft/seedance-directing.md`, `../craft/voice-and-performance.md`, `../craft/captions.md`,
and `../craft/b-roll.md`.

That list is complete, and the always-read craft in `../index.md` applies regardless of format.
