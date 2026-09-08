# `@hypit/stand-in`

A stand-in Card is an ordinary generic image Candidate selected by a Run when a composition needs
visible pixels before the intended media exists. It knows nothing about the displaced Candidate's
Producer, model, prompt or request. The resulting file goes through the same media operations as any
other image.

This package exports `card` and the convenience composition `timed-card`. A local media Provider
draws the Card. `timed-card` then gives that image to `@hypit/media-pipeline`, which holds it for the
requested duration and adds its clip-local time guide. Model packages do not know these
Fragments exist.

```xml
<import from="@hypit/stand-in@1" as="stand-in"/>
<fragment id="kitchen-card" using="stand-in:timed-card">
  <input name="canvas" from="vertical"/>
  <input name="duration" value="5"/>
  <input name="clock" from="clock"/>
</fragment>
<satisfy output="kitchen.video" candidate="kitchen-card.video"/>
```

Remove the `satisfy` line to select the Source's primary Candidate again. The Card has one visible
label and its canvas dimensions. The timed composition adds a coherent timecode, frame count and
progress guide, so the exact clip-local frame remains visible.

## Fragment inputs and exports

| Fragment | Inputs | Export |
| --- | --- | --- |
| `card` | `canvas`: CanvasSpace | `image`: BlobArtifact |
| `timed-card` | `canvas`: CanvasSpace, `duration`: SpeechDuration in seconds, `clock`: ProgramClock | `video`: BlobArtifact |

`from` on a Run input refers to a public value of the Author entry; literal duration can use
`value="5"`. The card capability still needs a selected media Provider. Studio can use it
when that Provider admits it for transient execution. An estimated SemanticTake is a separate
choice supplied by `@hypit/semantic-take-estimate` after normalization.

These are Run Fragments, so this package has no Markup Surface entries in `hypit vocabulary`.
