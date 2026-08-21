# Visual mixcut format

Use several short, visually distinct shots to create a music- or voice-led product/story montage.
The pictures carry the argument; captions are optional and normally omitted when there is no speech.

## Lock the beat structure

Give each shot a distinct role, for example:

1. hook: an immediately readable benefit, contrast, or visual question;
2. rhythm: a larger but controlled action that establishes momentum;
3. detail/proof: a stable close view of texture, mechanism, or result;
4. conversion/payoff: product, outcome, CTA, or a final memorable image.

Adjacent shots must differ in location, camera relationship, action, evidence, or emotional state.
A crop of the same image is not a new beat.

## Author the SVML shots

1. Generate or supply the exact first frame for each beat and pass every generated image through the
   image review gate.
2. Vendor `broll-v1.svs`; select one coherent material/edit language while varying the beat-specific
   English `story` slot.
3. Prefer `seedance:FrameVideo` when the first frame is the controlling fact. Use
   `seedance:ReferenceVideo` when the shot needs multiple ordered references. Set
   `generate-audio="false"`.
4. Add only motion that follows from the accepted first frame. Do not introduce a new person, room,
   product, camera side, or label inside the motion prompt.
5. Use explicit `pipeline:Transform` Trim/Retime operations when the accepted source needs a precise
   effective length. Place final clips as ordered full-frame `media-track:Item` inputs.

## Author timing, text, and sound

- Lock the delivery SemanticTrack before laying out Items. For a voice-led cut, an audio-only Take
  supplies program time and semantic anchors. For a music-only cut, keep the `whisperx:SemanticTake`
  and `speech:Track` declarations and satisfy `<track>.semantic` in `.svrun` with `build-record` and
  `satisfy`, then author explicit `start`/`end` windows against it — `../index.md` says why the
  declarations stay. Do not treat music as speech evidence.
- Omit Caption components when there is no spoken Script. Use `typo:Track` for title, benefit, and CTA
  copy.
- Keep no more than one or two text groups on screen at once. Align text handoffs to the final trimmed
  clip boundaries, and update them whenever a clip length changes.
- Normalize BGM or voiceover before placing it on an Audio Track. Make the musical idea or spoken hook
  audible within the first three seconds. Use explicit gain and fades.

## Preserve product truth

- Use supplied product art, labels, UI, screenshots, and alpha graphics when exact appearance matters.
- Product and ingredient claims must match verified source material and the visible shot.
- Keep labels facing a readable direction and inspect the product frame at pause-level detail.
- Alpha stickers and arrows must retain transparency and point to the intended CTA or evidence.

## Review and reuse

Review first frames, motion continuity, object/label stability, effective clip lengths, text handoffs,
audio start/end, claim accuracy, and the first/last second of the complete Film. Pin every accepted
image, clip, audio source, and the SemanticTrack with `.svrun` `build-record` and `satisfy`; regenerate
only failed beats.

Read `../craft/image-prompt-style.md`, `../craft/b-roll.md`, `../craft/overlays.md`,
`../craft/persona-and-audio.md`, and `../craft/sfx.md`.

That list is complete: `../index.md` does not repeat it, and the craft its required load
order marks always-read is required regardless of format.
