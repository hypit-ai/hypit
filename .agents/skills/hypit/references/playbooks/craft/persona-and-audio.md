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
  supplied identity or product facts. Pass every generated image through `production-gates.md`.
- Use `mimo:Preset` for a selected built-in voice, `mimo:VoiceDesign` for an English voice description,
  or `mimo:VoiceClone` with one explicit `sample` Artifact.
- Feed exact Script speech text through each MiMo component's `speech={story.segment.NAME.speech}`
  edge. Voice instructions affect delivery; they do not replace or rewrite Script words.
- For Seedance speaking formats, render the matching Kit and connect image/audio references to
  `seedance:ReferenceVideo` in the exact order defined by `seedance-directing.md`.
- Do not add a face or voice reference to a shot that does not need that identity. Extra references
  increase ambiguity and can contaminate the intended subject.

## Plan voice before picture duration

- When TTS is the sole narration source, choose the voice and generate or measure the real speech
  before locking visual cut lengths.
- Use `estimate:Speech` only for deterministic pre-generation planning. Final caption and semantic
  timing comes from each accepted normalized Take through `whisperx:SemanticTake`.
- One continuous voiceover may cover several independently selected visual shots. Do not split TTS
  merely because the picture cuts.
- For dialogue generated inside speaking Seedance takes, preserve Script Segment order when assembling
  `speech:Take` children.

## Choose one path for speech audio

- Normalize authoritative speech-bearing generated or supplied audio, create its
  `whisperx:SemanticTake`, then put that value in `speech:Track` as a `speech:Take`. An audio-only
  Semantic Take contributes timing and speech audio without inventing a visual clip.
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
- Raw Media Track video is visual-only unless `audio="include"` is explicitly authored.
- Dialogue wins the mix. Use explicit gain and fades; do not assume automatic ducking, loudness
  normalization, or mastering.

## Review and reuse

- Listen for identity consistency, pronunciation, cadence, clipping, room mismatch, synthetic tails,
  cross-talk, and words that no longer match the Script.
- Review dialogue alone, then with music, then with effects on both headphones and ordinary speakers.
- Do not approve caption timing from silent or placeholder audio.
- Pin accepted face, voice, and take Records in later `.svrun` files with `build-record` and
  `satisfy`; regenerate only the failed contribution.
