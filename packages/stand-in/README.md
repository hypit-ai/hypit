# `@hypit/stand-in`

A stand-in is an ordinary generic Candidate selected by a Run in place of an output that is not
needed yet. It knows nothing about the displaced Candidate's Producer, model, prompt or request.
The Run supplies only the media shape the downstream composition needs, and the resulting file goes
through the same inspect and normalize steps as any other file.

This package exports three Run Fragments: `image`, `video` and `silence`. A local media Provider
materializes their deterministic files. Model packages do not know these Fragments exist.

```xml
<import from="@hypit/stand-in@1" as="stand-in"/>
<fragment id="kitchen-card" using="stand-in:video">
  <input name="canvas" from="vertical"/>
  <input name="duration" value="5"/>
  <input name="clock" from="clock"/>
</fragment>
<satisfy output="kitchen.video" candidate="kitchen-card.video"/>
```

Remove the `satisfy` line to select the Source's primary Candidate again. The card carries a
diagonal STAND-IN watermark, its kind, frame and duration and — for video — a running timecode and
progress bar, so a cut that lands on the wrong frame remains visible.

## Fragment inputs and exports

| Fragment | Inputs | Export |
| --- | --- | --- |
| `image` | `canvas`: CanvasSpace | `image`: BlobArtifact |
| `video` | `canvas`: CanvasSpace, `duration`: SpeechDuration in seconds, `clock`: ProgramClock | `video`: BlobArtifact |
| `silence` | `duration`: SpeechDuration in seconds | `audio`: BlobArtifact |

`from` on a Run input refers to a public value of the Author entry; literal duration can use
`value="5"`. The card/silence capability still needs a selected media Provider. Studio can use it
when that Provider admits it for transient execution. An estimated SemanticTake is a separate
choice supplied by `@hypit/semantic-take-estimate` after normalization.

These are Run Fragments, so this package has no Markup Surface entries in `hypit vocabulary`.
