# Preparing media for a production

Read this when admitting files, connecting generated media, choosing streams, or editing a clip
before using it in a Track or a model reference. [Tracks](tracks.md) covers placement and playback.
For a source video at a link, read [video download](video-downloads.md).
For acquiring website screenshots, page recordings or local HTML graphics, read
[browser capture](browser-capture.md).

Media carries the visible performance and sound. Preparing it for a video answers two further
questions: how it occupies the program's time, and which Script passage it realizes. Normalization
establishes the frame clock and selected picture/audio streams. A SemanticTake adds the association
with Script and the locations of its words and boundaries.

## Files and generated Outputs

File declarations publish a **BlobArtifact**, a reference to the file's bytes, under their own id:

```svml
<import as="asset" from="@hypit/media@1"/>

<asset:Image id="product" src="./assets/product.png"/>
<asset:Video id="performance" src="./assets/performance.mp4"/>
<asset:Audio id="music" src="./assets/music.wav"/>
```

Use `{product}`, `{performance}` and `{music}` as inputs that accept these BlobArtifacts. A model
Surface can publish the same kind of value under an output path, such as `{portrait.image}` or
`{opening.video}`. The package vocabulary gives that path. File paths are relative to their Source;
[project setup](../creation/project-files.md#establish-the-project-boundary) explains the declared project boundaries.

An image reference can enter a model directly. A still placed by Media Track needs its actual
IntrinsicExtent as well. Inspect its dimensions with `hypit media probe <file>` and declare them
with `space:Extent`; [spatial layout](spatial.md) explains extent versus destination Frame.

## Prepare moving media on the program clock

Clips can arrive with different frame rates, several streams or picture and sound of different
lengths. Normalize selects the intended streams and expresses them on the program's frame clock,
so their lengths and later playback can be combined precisely.

The following excerpt prepares a performance and an independent soundtrack:

```svml
<import as="program" from="@hypit/program-space@1"/>
<import as="pipeline" from="@hypit/media-pipeline@1"/>

<program:Clock id="clock" frame-rate="30"/>
<pipeline:Normalize id="performance-media" source={performance} clock={clock}
  video="primary-moving" audio="default" span-authority="video"/>
<pipeline:Normalize id="music-media" source={music} clock={clock}
  video="none" audio="default" span-authority="audio"/>
```

The Clock is an authored rate; the prepared media supplies the resulting length. Share the Clock
across Takes that will join one program.

- `video` selects the moving-picture stream, or `none` for audio-only material.
- `audio` selects the embedded audio, or `none` when the material should carry no sound.
- `span-authority` chooses which stream determines the prepared duration when stream lengths differ.

`primary-moving` excludes attached cover art. The default audio selection uses the default or
unambiguous audio stream; select an explicit stream when the container has several intended choices.
`hypit vocabulary @hypit/media-pipeline --tag Normalize` gives the supported selectors.

Normalization inspects the bytes and produces `{performance-media.media}`: a SynchronizedMedia value
with an exact frame count, optional picture and optional audio on the shared timeline. Audio is
prepared as a 48 kHz render stem with its level preserved. Balance, fades and music ducking remain
mix decisions in [Audio Track and sound mix](../playbooks/craft/sound-mix.md).

## Associate a performance with Script

For an already declared Script and prepared spoken performance:

```svml
<import as="whisperx" from="@hypit/whisperx@1"/>

<whisperx:SemanticTake id="opening-semantic" narrative={story}
  segment={story.segment.opening} media={performance-media.media} language="en"/>
```

WhisperX supplies timed speech evidence; alignment locates the authored Script in that evidence.
Script remains the wording authority, and this step establishes where its words occur in the
performance. The result `opening-semantic.take` contains the same media and that Segment's local
timing. Speech Track assembles Takes in their intended order and translates their local positions
into program time.
Use the performed language supported by the selected package and Endpoint.

Audio-only A-roll follows the same path with audio-only media. Voice Clone produces the Segment's
performed audio from its Script and the person's Voice Reference. Normalize that output with
`video="none"`, `audio="default"` and `span-authority="audio"`, then align it to the same Segment.
The resulting SemanticTake publishes semantic time and sound through Speech Track without inventing
a visual performance; the work's Media, Typography or MG Tracks supply the picture.

## Empty Segments use their media boundaries

An ordinary Script Segment such as `<empty></empty>` can carry a passage without words. Its prepared
media gives it a duration, so the resulting SemanticTake has the Segment's start/end Anchors and no
timed Tokens. It enters the same Speech Track assembly as a spoken Take.

The semantic Surface maps an empty Segment directly to its prepared media domain:

```svml
<whisperx:SemanticTake id="pause" narrative={story}
  segment={story.segment.pause} media={pause-media.media}/>
```

This performs boundary materialization without a transcription request because the Segment has no
Tokens. Action, music or visual rhythm can determine the media duration. The ordinary SemanticTake
enters Speech Track alongside spoken Takes.

## Give a still a duration when that is its role

A still B-roll Item already occupies an authored Window. To make one or several images into a
time-bearing clip, use StillVideo:

```svml
<import as="media" from="@hypit/media-pipeline@1"/>

<media:StillVideo id="opening-still" source={product} duration="6" clock={clock}/>
<pipeline:Normalize id="opening-media" source={opening-still.video}
  video="primary-moving" audio="none" span-authority="video" clock={clock}/>
```

StillVideo produces a video-only BlobArtifact. Multiple `media:Still` children divide the authored
duration by their optional weights. Normalization then makes that clip usable as prepared moving
media. Choose it when one or more held images need to become a time-bearing video Artifact; its role
is assigned by the downstream Source relationships just like any other video.

## Edit bytes at an explicit point in the graph

```svml
<media:Transform id="edited" source={performance-media.media}>
  <media:Trim tail="0.25s"/>
  <media:Retime rate="1.05" pitch="preserve"/>
</media:Transform>
<media:ExtractAudio id="voice-reference" source={edited.video} audio="default"/>
<media:ExtractFrame id="frame-reference" source={edited.video}
  video="primary-moving" at="last"/>
```

Transform applies its operations in order. These Outputs are BlobArtifacts; normalize an edited
clip again when feeding it into a prepared-media input, and align the edited performance when its
timing changed. Extracted audio or a frame can directly feed a compatible model reference port.
`ExtractFrame` also accepts `first`, `frame:<index>` and `time:<seconds>`.

Use graph operations for repeatable preparation belonging to the production. `hypit media` commands
are useful for inspection and deliberately exported evidence. Image geometry changes, compositing
and cutouts have separate installed vocabulary in `@hypit/image-transform`, `@hypit/image-compose`
and `@hypit/background-removal`; select the operation that matches the asset's intended use.
When the composition calls for isolating a subject from its background, read
[insets and background removal](../playbooks/craft/compositing.md#inset-cutout-and-flattened-composite-are-distinct-choices)
for the choice of treatment and how its processed media returns to this preparation flow.
