# Voiceover desk-demo format

Use one continuous voiceover as the timing authority while independent silent visual shots follow
screen, product, hand, or proof changes.

## Author the SVML program

1. Write one narration Script Segment with Selections/Moments for every visual proof beat.
2. Generate one continuous narration Blob with `mimo:Preset`, `mimo:VoiceDesign`, or
   `mimo:VoiceClone`. Do not split TTS to match picture cuts.
3. Put the audio directly into an audio-only Speech Take:

```svml
<program:Clock id="clock" frame-rate="30"/>
<pipeline:Normalize id="narration-media" source={narration.audio}
  video="none" audio="default" span-authority="audio" clock={clock}/>
<whisperx:SemanticTake id="narration-semantic" narrative={story}
  segment={story.segment.narration} media={narration-media.media}/>
<speech:Track id="speech"
  visual-frame={full-frame} visual-appearance={recipes.speech.visual} visual-z="0">
  <speech:Take source={narration-semantic.take}/>
</speech:Track>
```

4. Pass `{speech.semantic}` to every Media/Typography/Caption/Audio Track and add
   `{speech.audio}` directly to `film:Film`.
5. Build each visual beat from supplied media or the vendored `broll-v1` Kit. Generated desk/screen
   shots use `seedance:FrameVideo` or `seedance:ReferenceVideo` with `generate-audio="false"`.
6. Place visuals by the measured Script Selections/Moments. One sentence may span several visual
   cuts, and one visual may cover only part of a sentence.
7. Add editorial explanation with `typo:Track`; add the complete Caption chain only when narration
   captions are wanted. Normalize only additional BGM/SFX before placing them on `audio:Track`.

## Preserve UI and physical geometry

- Use supplied screenshots or recordings whenever exact interface wording, values, charts, buttons,
  or state changes matter.
- Keep product UI physically attached to the screen. Do not place interface content on the laptop
  lid, keyboard, or an impossible plane.
- A person-facing context shot and a device-facing proof shot are opposing camera positions. Their
  views must show different backgrounds: different room sectors and different dominant landmark
  sets. The same background is an automatic rejection.
- The two views must show different background sectors and different landmark sets.
- Preserve device model, orientation, bezel, screen plane, user eye line, room, lighting logic, and
  hand contact across the pair.

## Pace and review

- Generate or measure the actual narration before locking shot lengths.
- Let visual cuts follow visible changes, not punctuation or sentence boundaries.
- Review the full-resolution reference images first, then silent visual takes, then narration alone,
  then the complete Film with captions, typography, music, and effects.
- Reject unreadable UI, changed text, same-background reverse views, impossible hands, voice drift,
  clipped narration, or visual proof that arrives before its setup.
- Pin accepted narration and visuals through `.svrun` `build-record` and `satisfy`.

Read `../craft/screen-demo.md`, `../craft/b-roll.md`, `../craft/persona-and-audio.md`, and
`../craft/visual-continuity.md`.
