# Persona and audio craft

Treat visual identity, voice identity, spoken truth, music, and effects as separate authored facts.
Connect only the references a component actually needs.

## Establish authoritative identity

- Choose one clear visual anchor for each recurring person and product. Declare supplied anchors with
  `media:Image`, or reuse an accepted generated image Record through the Run Source.
- Choose voice from real supplied audio, an explicit preset, a written voice design, or an explicit
  clone sample. Never infer a person's voice, accent, age, or delivery from appearance alone.
- Choose it once. One accepted sample per person feeds every line they say and every take they appear
  in, as `generated-dependencies.md` requires; choosing again per take produces a second voice.
- Keep one persona contract across recurring takes: face, apparent age range, hair, wardrobe logic,
  vocal texture, accent, pace, delivery, and emotional register.
- Preserve quoted sample dialogue verbatim in its original language. All generation instructions and
  voice-design descriptions are written in English.
- Trim reference audio to a clean, representative passage without unrelated speakers, long silence,
  music, clipping, echo, or abrupt edits.

## Author faces and voices explicitly

- Use `gpt:Image` with ordered `gpt:Reference` children when a new character/scene image must preserve
  supplied identity or product facts.
- Use `mimo:VoiceDesign` with a written voice description. Generate the sample once per person.
- That sample is a reference on every take the person appears in, and the take speaks the Segment.
  `generated-dependencies.md` holds the rule and what it costs: one generation carries the speech and
  the picture, so the Segment's length and its picture's length are one number.
- For Seedance speaking formats, render the matching Kit and connect image/audio references to
  `seedance:ReferenceVideo` in the exact order defined by `seedance-directing.md`.
- Do not add a face or voice reference to a shot that does not need that identity. Extra references
  increase ambiguity and can contaminate the intended subject.

## The take's own length is the Segment's length

- The speaking take generates the speech, so a Segment is exactly as long as the take that speaks it.
  There is no second duration to reconcile.
- Use `estimate:Speech` only to size a generation before it is ordered. Final caption and semantic
  timing comes from each accepted normalized Take through `whisperx:SemanticTake`.
- One continuous voiceover may cover several independently selected visual inserts. Do not cut the
  Script merely because the picture cuts — the inserts are Selections inside the Segment.
- Preserve Script Segment order when assembling `speech:Take` children.

## Choose one path for speech audio

- Normalize the speaking take, create its `whisperx:SemanticTake`, then put that value in
  `speech:Track` as a `speech:Take`. The take carries the speech and the picture together, so that one
  value is both the Segment's timing and the picture over it.
- Do not place the same narration on both Speech Track and an Audio Track. That duplicates speech in
  the final mix and creates competing time authority.

## Put non-speech audio on Tracks

Generated or supplied audio is a Blob until it is explicitly normalized. Prepare an audio-only source
as `SynchronizedMedia`, then place it with `audio:Track`:

```svml
<media:Audio id="music-source" src="./assets/music.wav"/>
<pipeline:Normalize id="music-media" source={music-source}
  video="none" audio="default" span-authority="audio" frame-rate="30"/>

<audio:Track id="music-track" semantic={speech.semantic}>
  <audio:Clip source={music-media.media} during="program"
    playback="once" gain="0.18" fade-in="6f" fade-out="12f"/>
</audio:Track>
```

- Keep primary speech, music, ambience, and effects as independently inspectable contributions. Add
  Speech Track's audio projection and every selected Audio Track to `film:Film`.
- A Media Track carries picture alone unless the source was normalized with `audio="default"`.
- Dialogue wins the mix. Use explicit gain and fades; do not assume automatic ducking, loudness
  normalization, or mastering.

## Review and reuse

- Listen for identity consistency, pronunciation, cadence, clipping, room mismatch, synthetic tails,
  cross-talk, and words that no longer match the Script.
- Review dialogue alone, then with music, then with effects on both headphones and ordinary speakers.
- Do not approve caption timing from silent or placeholder audio.
- Pin accepted face, voice, and take Records in later `.svrun` files with `build-record` and
  `satisfy`; regenerate only the failed contribution.
