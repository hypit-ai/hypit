# ASMR format

Use close material detail, one readable physical action per shot, and deliberately synchronized
texture sound to create a calm, satisfying micro-film.

## Author the visual

1. Establish one accepted first frame with clear material texture, exact tool/object count, visible
   contact points, and a physically possible starting state.
2. Vendor `broll-v1.svs`. Use `product-beauty` or `practical-real`, `single-moment` or
   `process-demo`, `continuous-shot`, `product-macro` or `reference-locked`, and `micro` or
   `readable` motion.
3. Put only the visible action in the English `story` slot: cut, pour, wipe, press, fold, rub, peel,
   place, or another small event that can complete naturally in one take.
4. Use `seedance:FrameVideo` for one controlling first frame or `seedance:ReferenceVideo` for
   multiple ordered material references. Set `generate-audio="false"`.
5. Keep raw Seedance duration at an integer 4–15 seconds. Use explicit media Trim/Retime only after
   reviewing the generated take.

Avoid rapid edits, large camera moves, busy backgrounds, multiple simultaneous actions, or motion
that hides the contact point. Use `standard` for 1080p/4k detail; `fast` and `mini` are limited to
480p/720p.

## Author the sound

- Use supplied or generated texture sound, ambience, and optional music as explicit sources.
- Normalize every Blob with `pipeline:Normalize`, then place it through `audio:Track` and
  `audio:Clip` on the delivery ProgramSpace.
- Align impacts and texture changes to the audience-perceived contact event with explicit timing.
- Use one sound for one function. Do not cover a delicate material sound with unnecessary impacts,
  whooshes, or dense music.
- Set trim, playback, gain, fade-in, and fade-out explicitly. Do not assume automatic looping,
  ducking, or loudness normalization.

For a speech-free ASMR edit, omit WhisperX and Caption components. Select a verified ProgramSpace
Record in `.svrun` with `build-record` and `satisfy`, then author explicit windows against that
ProgramSpace. The selected Record is the delivery time contract.

## Review and reuse

Inspect the actual take for material detail, tool/object count, hand geometry, contact, motion speed,
label stability, duplicated objects, camera drift, and broken tail frames. Then review sound against
the visible event, including headphones and ordinary speakers. Pin accepted first frames, takes,
and audio Records with `.svrun` `build-record` and `satisfy`.

Read `../craft/b-roll.md`, `../craft/sfx.md`, `../craft/persona-and-audio.md`, and
`../craft/production-gates.md`.
