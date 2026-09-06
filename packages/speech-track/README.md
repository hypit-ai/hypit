# `@hypit/speech-track`

Assemble the performances carrying the Script into one semantic timeline, with separate picture and
sound outputs. In the usual spoken production, these performances are the A-roll. A speaker can be
covered by B-roll while their words continue to define the semantic time of the piece. A podcast's
speaking turns share this timeline; an independent narration can also carry it.

A-roll can be a circular picture-in-picture or a foreground presenter cutout over another main
picture. Its speaking performance establishes the semantic timeline regardless of its screen area
or stack order. Speech Track supplies that timeline and sound even when Media Track or a project
component supplies the chosen presentation of the same person.

## Assemble prepared Takes

Normalize the media and associate each Script Segment with a SemanticTake before assembly. A spoken
Take includes aligned words; a wordless Take includes its media and Segment boundaries. One Take can
contain several speakers or camera cuts. Takes are assembled in Source order:

```svml
<import as="speech" from="@hypit/speech-track@1"/>

<speech:Track id="speech" visual-frame={layout.full}
  visual-appearance={look.performance} visual-z="0">
  <speech:Take source={opening.take}/>
  <speech:Take source={answer.take}/>
</speech:Track>
```

This excerpt assumes the Takes, Frame and appearance Recipe exist. A fit Recipe can be
`performance { fit: cover; }`. The shared frame rate and total ProgramSpace come from the ordered
Takes. Their local word and boundary frames become positions in that assembled space.

| Output | Use |
| --- | --- |
| `.semantic` | Supply semantic timing to Film, Caption, Media, Typography, Audio and other components |
| `.visual` | Include the performance picture in Film when wanted |
| `.audio` | Include the performance sound in Film, including beneath B-roll |

Select each wanted picture and sound output explicitly in Film. Replacing the visible picture with
Media Track coverage does not replace the semantic timeline or mute the included performance audio.
An audio-only performance can supply the timeline while other Tracks supply the picture.

## Place the performance and extend its presentation

`visual-frame`, `visual-appearance` and `visual-z` supply the Track's visual base. A Take can override
it with `frame`, `appearance` and `z`. This places and stacks the same performance picture. Use
[Media Track](../media-track/README.md) for an independently animated presentation, replacement
Sequence or transition. Caption and MG consume `.semantic` to follow the same words and events.

The [Studio Companion](../speech-track-studio/src/index.ts) presents the assembled Takes and their
materials. Media preparation is owned by [Media Pipeline](../media-pipeline/README.md), and exact
SemanticTake values by [Speech](../speech/README.md).
