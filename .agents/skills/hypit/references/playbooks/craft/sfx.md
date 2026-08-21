# Sound-effects craft

Sound effects support discrete visible or editorial events. They do not replace music, ambience, or
clear dialogue.

## Give each sound one purpose

- Add a sound only when the audience can perceive the corresponding event: contact, landing, UI state
  change, reveal, transition, or completion.
- One sound should perform one job. Do not stack impact, whoosh, click, and ambience on the same beat
  unless the story explicitly requires a layered event.
- Trigger at the audience-perceived event, not automatically at every shot boundary.
- Keep one consistent sound vocabulary for repeated UI states, cards, reveals, and actions.
- Let music carry continuous emotion; use SFX for discrete events and ambience for environmental
  continuity.

## Author SFX in SVML

Declare the source, normalize it to audio-only `SynchronizedMedia`, and place it with an `audio:Clip`:

```svml
<media:Audio id="reveal-source" src="./assets/reveal.wav"/>
<pipeline:Normalize id="reveal-media" source={reveal-source}
  video="none" audio="default" span-authority="audio" clock={clock}/>

<audio:Track id="effects" semantic={speech.semantic}>
  <audio:Clip source={reveal-media.media}
    at={story.moment.reveal} for="600ms"
    playback="once" gain="0.45" fade-in="0f" fade-out="3f"/>
</audio:Track>
```

- Use `during={story.selection.NAME}` for a range, a Script Moment plus `for` for a point event, or
  explicit `start`/`end` timing in the SemanticTrack frame domain.
- Use `playback="once"` for a discrete effect, loop only for a genuinely repeating texture, and
  bounded pitch-preserving stretch only when the occupancy must fill an authored range.
- Use explicit trim, gain, fade-in, and fade-out. The Audio Track preserves source level and does not
  add automatic loudness normalization or ducking.
- For a sound owned by a Media Item or Sequence transition, use `media-track:Sound` with an explicit
  enter, exit, or named Handoff trigger.

## Protect dialogue

- Dialogue remains the most important audio. Keep effects short and light enough not to mask
  consonants, numbers, names, product terms, or conclusions.
- Avoid strong transients on the same instant as a critical word. Move, shorten, or reduce the effect
  rather than sacrificing speech clarity.
- Leave breathing space between repeated events. A dense series of identical effects usually means
  the visual rhythm or sound plan needs simplification.

## Review the complete mix

1. Listen to dialogue alone.
2. Add music and confirm every word remains clear.
3. Add effects one family at a time.
4. Listen on headphones and ordinary phone/laptop speakers.
5. Play the entire program from start to finish and judge cumulative density, not isolated loops.

Verify each trigger against the visible event and check the first/last second for clipped tails or
effects that outlive the picture.
