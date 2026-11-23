# Audio Presents (`audio-clips.md`)

Read this when placing speech, music, ambience, or sound effects on Audio Tracks. [Sound direction](../playbooks/craft/sound-mix.md) owns mix judgment; this page owns the SVML audio contract.

## Place an Audio Present

Audio lives on `<track kind="audio" role="audio">` elements. Speech, music, ambience, and sound effects all use the same `<present>` element:

```xml
<track id="voice" name="Voice" kind="audio" role="audio" enabled="true">
  <present id="narration" name="Narration" source="media" start="0/1" duration="15/2" enabled="true">
    <media path="./media/narration.media.json"/>
    <source-time>
      <linear start="0/1" duration="15/2" source-start="0/1" source-duration="15/2"/>
    </source-time>
    <audio>
      <gain value="1/1"/>
    </audio>
  </present>
</track>

<track id="music" name="Music" kind="audio" role="audio" enabled="true">
  <present id="bed" name="Music Bed" source="media" start="0/1" duration="15/2" enabled="true">
    <media path="./media/music.media.json"/>
    <source-time>
      <linear start="0/1" duration="15/2" source-start="0/1" source-duration="15/2"/>
    </source-time>
    <audio>
      <gain value="9/50"/>
      <fade-in duration="2/5"/>
      <fade-out duration="3/5"/>
    </audio>
  </present>
</track>
```

A video file with embedded sound does **not** play audio merely by being placed on a Picture Track ([Picture Presents](visual-clips.md)). To hear its sound, place a corresponding `<present>` on an Audio Track referencing the same `*.media.json` (or an extracted audio asset). This prevents accidental audio duplication when reusing footage across picture layers.

## Sampling, Gain, and Mixing

- **Exact timing**: `start`, `duration`, and `<source-time>` use exact rational seconds (`numerator/denominator`). See [Timing](timing.md).
- **Gain**: `<gain value="..."/>` is a linear amplitude multiplier expressed as a rational number (for example, `1/1` for unity, `1/5` for -14 dB background bed).
- **Fades**: `<fade-in duration="..."/>` and `<fade-out duration="..."/>` apply across the boundaries of the Present.
- **Additive mixing**: overlapping Audio Presents across tracks mix additively into the stereo program bus.
- **Ducking and envelopes**: when music must duck under speech or follow complex gain curves, compute the rational automation segments in TSX ([TSX Authoring](authoring.md)) or split/shape the music Present cleanly around spoken windows.

## Syncing Voice and Picture

When voice and picture come from the same recorded or generated video clip, place both Presents with matching `start`, `duration`, and `<source-time>` values (or group them in a `<group>` so NLE Studio moves them together). When voice is generated separately via speech synthesis (`@hypit/fishaudio-speech`, `@hypit/mimo-speech`, `@hypit/minimax-h3`), place the voice track first, align its transcript with `hypit transcript align` ([Timed Transcripts](script-syntax.md)), and cut picture tracks to those exact word timestamps.
