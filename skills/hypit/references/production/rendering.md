# Composition and rendering

Read this when assembling the deliverable or rendering a frame interval for review. [Tracks](tracks.md)
explains the contributing layers; [Runs](runs.md) explains selecting existing media for this execution.

Composition chooses which pictures and sounds form the video and how they share space and time.
Rendering evaluates that composition over a frame interval and produces the encoded media. The
same composition can therefore be inspected in Studio, rendered in part, or rendered as a whole.

## Assemble the picture and sound

With the named inputs already declared:

```svml
<import as="film" from="@hypit/film@1"/>
<import as="render" from="@hypit/render-hyperframes@1"/>

<film:Film id="main" canvas={canvas} semantic={speech.semantic}
  appearance={look.film.main}>
  <film:Track source={speech.visual}/>
  <film:Track source={speech.audio}/>
  <film:Track source={coverage.visual}/>
  <film:Track source={captions.track}/>
  <film:Track source={music.track}/>
</film:Film>
<render:Video id="final" composition={main.composition} semantic={speech.semantic}/>
```

An example Film Recipe is `film.main { background: #18212A; }`. Canvas supplies the picture dimensions;
the SemanticTrack supplies program time. Include each wanted audio output explicitly. A covering
picture leaves the included performance audio audible. Layer order is authored in the Tracks'
Presents, so moving these Film children does not reorder the picture.

`main.composition` is the assembled work, usable in Studio. `final.video` asks for an encoded video.
A compatible Composition from another component can also feed the render Surface.

## Choose a render interval in frames

```svml
<render:Video id="detail" composition={main.composition} semantic={speech.semantic}
  start-frame="240" end-frame-exclusive="360"/>
```

Both bounds refer to the original program's frame clock. The interval includes frame 240 and ends
before 360: 120 frames, or seconds 8–12 at 30 fps. Omit both bounds for the whole program. For a
rational frame rate, compute seconds from its numerator and denominator rather than rounding the
rate first.

The original animation time remains intact, and picture and sound use the same interval. A short
Run can target `detail.video` while the normal Run continues to target `final.video`.

**The range limits final rendering. Upstream generation still follows the selected graph.** Keep
the Run Candidates for usable media and SemanticTakes when inspecting a Caption or MG revision.
Inspect `hypit plan` for the work that remains before submission. [Authoring](authoring.md#reuse-produced-work-explicitly)
explains choosing the reuse boundary.

## Execution and capacity

HyperFrames compiles the selected composition and renders its picture. Timeline audio is rendered
from the included AudioTracks, then picture and sound are muxed into the delivered file. A Runtime
can bind these capabilities to different compatible Endpoints.

For the local HyperFrames Provider, `workers` selects parallel frame workers and `browserCapacity`
limits shared browser usage. These belong to the Runtime configuration; the Source keeps the same
render declaration. [Runtime profiles](../environment/profile.md) explains worker choices, shared
capacity and inspecting the selected Provider's configuration. Confirm that the chosen Endpoint
supports range requests; the local HyperFrames implementation does.

Use [Builds and Results](builds.md) to submit, follow and retrieve `final.video` or `detail.video`.
Use [Review](review.md) to judge the observed interval or complete deliverable against the intended work.
