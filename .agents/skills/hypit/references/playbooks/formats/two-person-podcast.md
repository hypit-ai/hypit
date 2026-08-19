# Two-person podcast format

Use two final camera-view references and intentional speaker/reaction cuts to build a coherent
two-person conversation.

## Lock the two-view geometry first

Draw the room and name camera positions A and B before generating either view.

- View A and View B belong to the same room, but they must show different background sectors and
  different dominant landmark sets.
- The two backgrounds must never be identical, near-identical, horizontally mirrored, or the same
  wall with only the person changed.
- Preserve seating, eye lines, table edge, microphones, shared props, light direction, lens feel,
  and left/right relationship across the pair.
- Reject and regenerate both images when the geometry cannot explain how the two cameras occupy the
  room.

## Author the SVML program

1. Write Script turns with explicit A/B Role Cues. Use Dual Text for exact display/pronunciation
   differences while preserving the intended visible spelling.
2. Prepare the accepted final A-view and B-view images plus ordered A/B voice references.
3. Vendor `podcast-v1.svs`. Select `framing`, `edit-language`, `pacing`, `performance`, `reaction`,
   and `gesture` in an SVS Recipe.
4. Render each Segment with `copy:Render`, Script dialogue, and an optional English action direction.
5. Generate each take with `seedance:ReferenceVideo generate-audio="true"`, both final views, and
   both voice references in the Kit's declared order.
6. Assemble accepted takes through `speech:Spine`, run `whisperx:Alignment`, then add exact-font
   Captions, evidence Media, Typography, and optional Audio Tracks.
7. Assemble with `film:Film`, render with `render:Video`, and use separate `.svrun` Sources with
   explicit Targets for staged review and delivery.

## Direct turns and cuts

- Let each speaker finish a natural thought. Short challenges may lead into longer grounded answers;
  do not create rapid alternation by splitting one sentence into fragments.
- Use the Recipe's speaker-following or reaction-cut pattern. Do not write camera cuts, new angles,
  zooms, or location changes into the action slot.
- Camera stability and performer intensity are independent: a host may lean, laugh, gesture, or
  change posture while the two established camera views remain fixed.
- Only the current speaker moves their mouth. A listener cutaway stays silent but visually alive.
- A skeptical format works well as bold claim → short challenge → mechanism/evidence → grounded
  payoff that returns to the hook. A phone CTA is optional and appears only when the Script requires it.

## Review and reuse

Review the two reference images side by side before video generation. Reject same-background reverse
views, broken eye lines, contradictory seating, duplicated microphones, prop drift, or impossible
lighting. Then review every take for voice assignment, exact words, lip-sync, reaction timing,
camera selection, and identity. Pin accepted views and takes through `.svrun` `build-record` and
`satisfy`.

Read `../craft/visual-continuity.md`, `../craft/seedance-directing.md`, `../craft/captions.md`, and
`../craft/persona-and-audio.md`.
