# Audio Presents (`audio-clips.md`)

Read this when placing speech, music, ambience, or sound effects on Audio Tracks. [Sound direction](../playbooks/craft/sound-mix.md) owns mix judgment; this page owns the SVML audio contract.

## Place an Audio Present

Dedicated audio lives on `<track kind="audio" role="audio">` elements. Speech, music, ambience, and sound effects all use `<present>` with an `<audio>` appearance (and no `<picture>`):

```xml
<track id="voice" name="Voice" kind="audio" role="audio" enabled="true">
  <present id="narration" name="Narration" source="media" start="0/1" duration="15/2" enabled="true">
    <media path="./media/narration.media.json" />
    <source-time>
      <linear target-start="0/1" target-end="15/2" source-start="0/1" rate="1/1" />
    </source-time>
    <audio />
  </present>
</track>

<track id="music" name="Music" kind="audio" role="audio" enabled="true">
  <present id="bed" name="Music Bed" source="media" start="0/1" duration="15/2" enabled="true">
    <media path="./media/music.media.json" />
    <source-time>
      <linear target-start="0/1" target-end="15/2" source-start="0/1" rate="1/1" wrap-start="0/1" wrap-end="30/1" />
    </source-time>
    <audio>
      <process id="music-level" package="@project/audio-effects" symbol="gain" enabled="true">
        <parameters>{"gain":0.18}</parameters>
        <control-time>
          <linear target-start="0/1" target-end="15/2" source-start="0/1" rate="1/1" />
        </control-time>
      </process>
    </audio>
  </present>
</track>
```

Media and Composition Presents on a Picture Track may also include `<audio />` directly when you want their embedded audio to play in lockstep with picture. Avoid placing `<audio />` on a Picture Present *and* duplicating the same clip on an Audio Track—choose one audio path per clip so speech is never double-tracked.

## Sampling, Audio Processes, and Mixing

- **Exact timing**: `start`, `duration`, and `<source-time>` use exact rational seconds (`numerator/denominator`). Supply `wrap-start` and `wrap-end` on `<linear>` to loop a background bed cleanly. See [Timing](timing.md).
- **Audio treatments are package `<process>` operators**: SVML does not hardcode individual effect elements; gain, fades, EQ, and ducking envelopes are authored as ordered `<process id="..." package="..." symbol="..." enabled="true">` children inside `<audio>` (or `<adjust>` items on a `<track kind="audio" role="effect">`).
- **Additive mixing**: overlapping Audio Presents across tracks mix additively into the stereo program bus.
- **Edge-aligned fades**: use `<control-time edge="start" duration="..." control-duration="..." />` or `edge="end"` on a fade Process so fades stay locked to the Present's head or tail even after trimming.

## Syncing Voice and Picture

When voice and picture come from the same recorded or generated video clip, either include `<audio />` on the Picture Present, or place matching Picture and Audio Presents inside a `<group>` so NLE Studio moves them together. When voice is generated separately via speech synthesis (`@hypit/fishaudio-speech`, `@hypit/mimo-speech`, `@hypit/minimax-h3`), place the voice track first, align its transcript with `hypit transcript align` ([Timed Transcripts](script-syntax.md)), and cut picture tracks to those exact word timestamps.
