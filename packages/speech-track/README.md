# `@hypit/speech-track`

Assemble ordered SemanticTakes into a semantic timeline and its original sound. The performance
carrying the Script is the A-roll, whether its picture fills the screen, appears in an inset,
is a transparent cutout, or is covered by other pictures. This role establishes time; the visual
composition decides where and how that material appears.

```svml
<speech:Track id="speech">
  <speech:Take source={opening.take}/>
  <speech:Take source={answer.take}/>
</speech:Track>
```

The Takes are already normalized and semantic. Source order and actual prepared lengths establish
the shared ProgramSpace. Local word positions and Segment boundaries become global positions.
One Take may contain several speakers or camera cuts; a wordless Take supplies its media boundaries.

| Output | Use |
| --- | --- |
| `.semantic` | Semantic time and prepared materials for Film, Caption, Media and project components |
| `.audio` | Original performance sound at its assembled positions |

Select `.audio` in Film when that sound belongs in the result. This explicit convenience projection
keeps the prepared source at its original speed and gain; a Take without audio contributes no clip.
For independent music, effects or authored mixing choices, use [Audio Track](../audio-track/README.md).

## Present the performance

[Media Track](../media-track/README.md#display-a-semantic-performance) can consume the assembled
performance through a Media Performance:

```svml
<media:Track id="performance" semantic={speech.semantic} canvas={canvas}>
  <media:Performance during="program" frame={layout.full}
    appearance={look.performance}/>
</media:Track>
```

Include `performance.visual` and `speech.audio` in Film. The Media Recipe supplies `stack-order`,
fit, clipping, rounded corners, border and other presentation choices. A selected window that starts
inside a Take begins at the matching source frame. Presentation continues across Take boundaries.

A project component can also consume `.semantic` and use `projectSemanticMedia` from
`hypit/semantic-track` to obtain selected material spans and their source positions. When video and
graphics share layout or motion, that component can own both in one visual program. Independent
Caption or other overlays can remain separate Tracks.

[Media Pipeline](../media-pipeline/README.md) owns preparation;
[Semantic Track](../semantic-track/README.md) owns the timeline and its projections.
The [Studio Companion](../speech-track-studio/src/index.ts) exposes the original audio clips.
