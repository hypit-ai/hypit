# Preparing media for a production

Read this when supplying files, connecting generated media, choosing streams, or editing a clip
before using it in a component or a model reference. [Visual Clips](visual-clips.md)
owns independent picture placement and playback; [Tracks](tracks.md) routes other content relationships.
For a source video at a link, read [video download](video-downloads.md).
For acquiring website screenshots, page recordings or local HTML graphics, read
[browser capture](browser-capture.md).

## Choose preparation from the intended use

Keep source facts, preparation and use distinct:

| Material or use | What the next consumer needs |
| --- | --- |
| Still image, including a transparent cutout | Bytes and its real dimensions for independent placement; the component supplies its display Window. |
| Video, with or without audio or transparency | Selected streams, an exact local presentation domain and the stream interpretation needed by downstream picture or sound consumers. |
| Audio | The selected audio stream and prepared local time; its role can be a Script performance, music, narration or an effect. |
| Compositable surface | Its declared pixels, extent and any animation information; use the producing package's output directly. |
| Code-authored text, shapes or a scene | The component's data and resources; it can draw directly without an intermediate media file. |
| A model reference | The exact image, video or audio input accepted by that model's declaration; prepare only the form that declaration accepts. |

Files, generated Outputs and earlier Results are sources of these values. A reference need not
appear in the film. Align a Script Segment to a video's local domain when the production consumes
that semantic timing relationship. [Authoring](authoring.md) owns accepting exported Result material
into the project. [Image operations](image-operations.md) owns still-image preparation.

Preparation establishes moving media's local domain, selected picture/audio streams and exact maps to source presentation time
streams. `NarrativeAlignment` separately adds one Script Segment's local word/boundary positions.
[Timeline construction](timeline.md) may consume the prepared Extent. A domain projector may consume
the local domain with an equal-length Timeline Window. Neither operation changes the media value.

## Files and generated Outputs

File declarations publish a **Blob**, a reference to the file's bytes, under their own id:

```svml
<import as="asset" from="@hypit/media@1"/>

<asset:Image id="product" src="./assets/product.png"/>
<asset:Video id="performance" src="./assets/performance.mp4"/>
<asset:Audio id="music" src="./assets/music.wav"/>
```

Use `{product}`, `{performance}` and `{music}` as inputs that accept these Blobs. A model
declaration can publish the same kind of value under an output path, such as `{portrait.image}` or
`{opening.video}`. The package vocabulary gives that path. File paths are relative to their Source;
[project setup](../creation/project-files.md#establish-the-project-boundary) explains the declared project boundaries.

A supplied recording can be a reference for new work, an independent picture or sound, or material
the finished work retains. When the intended passage keeps its actual recorded delivery, that
recording can carry the Script without regenerating it. If only part of the file belongs in the
work, prepare a new file locally with `hypit media cut`:

```bash
hypit media probe assets/recording.mp4
hypit media cut assets/recording.mp4 --start 12.4 --end 19.8 --to assets/opening.mp4
hypit media cut assets/recording.mp4 --keep 12.4:15.7 --keep 16.2:19.8 --to assets/opening-edited.mp4
hypit media cut assets/voice.wav --keep 0.3:4.1 --keep 4.6:9.2 --to assets/narration-edited.wav
```

The first form retains one interval; repeated `--keep` joins selected parts of the *same* recording.
The command keeps existing audio and picture together and can write an ordinary MP4 or audio-only
WAV. Import that output as `asset:Video` or `asset:Audio` for its intended use. If the edited
delivery is a Script performance, prepare it; align its local domain when another contribution
needs positions inside that performance, as described below.
Independent footage can instead enter a Visual Clip or another visual component, with source sound included
when the work needs it. A file cut does not choose Script or Segment boundaries. The installed Video
CLI README owns exact options and output behavior. `hypit transcribe` accepts either audio or video
when a transcript helps inspect the recording; its word times refer to that input file, while a
retained edited performance receives its own semantic alignment in the Build when the composition
consumes that timing.

An image reference can enter a model directly. A still placed as a Visual Clip needs its actual
IntrinsicExtent as well. Inspect its dimensions with `hypit media probe <file>` and declare them
with `space:Extent`; [spatial layout](spatial.md) explains extent versus destination Frame.

## Prepare moving media

Clips can arrive with different frame rates, several streams or picture and sound of different
lengths. Prepare selects the intended streams, preserves their exact local time and source relation,
and leaves the Film clock to the consumer.

The following excerpt prepares a performance and an independent soundtrack:

```svml
<import as="mediaop" from="@hypit/media-operations@1"/>

<mediaop:Prepare id="performance-media" source={performance}
  video="primary-moving" picture="source" audio="default" span-authority="video"/>
<mediaop:Prepare id="music-media" source={music}
  video="none" audio="default" span-authority="audio"/>
```

The prepared media supplies an exact length independently of a Film Clock. Visual and Audio consumers
each declare their own occurrence Window and exact sampling relation. The selected renderer evaluates only
the signal it consumes; its decoder, frame grid, sample buffers and caches are execution details.

- `video` selects the moving-picture stream, or `none` for audio-only material.
- `picture` selects how the chosen visual samples are interpreted. `source` requires complete embedded
  colour tags; use an explicit profile such as `sdr-bt709` when the accepted source is known to have
  missing or incorrect tags. Use `bt2100-pq10` or `bt2100-hlg10` only when that is the known source
  signal. These names describe source interpretation, not an HDR delivery. This choice does not
  transcode the file.
- `audio` selects the embedded audio, or `none` when the material should carry no sound.
- `span-authority` chooses which stream determines the prepared duration when stream lengths differ.

`primary-moving` excludes attached cover art. The default audio selection uses the default or
unambiguous audio stream; select an explicit stream when the container has several intended choices.
`hypit vocabulary @hypit/media-operations --tag Prepare` gives the supported selectors.

Preparation inspects the bytes and produces `{performance-media.media}`: a `PreparedMedia` value with
an exact local domain, optional picture and optional audio, and explicit maps to source presentation
time. It does not transcode or resample. Balance, fades and music ducking remain mix decisions in
[Audio Track and sound mix](../playbooks/craft/sound-mix.md).

## Choose an HDR working picture explicitly

Use HDR only when the intended delivery and selected Runtime Endpoint implement the complete HDR10
path. Name the Composition's working picture, mastering facts and delivery separately:

```svml
<media:WorkingPicture id="hdr-working" color-primaries="bt709"
  color-transfer="linear" reference-white-nits="203"/>
<media:HdrStaticMetadata id="hdr-metadata"
  red-x="0.708" red-y="0.292" green-x="0.170" green-y="0.797"
  blue-x="0.131" blue-y="0.046" white-x="0.3127" white-y="0.3290"
  min-luminance-nits="0.005" max-luminance-nits="1000"
  max-content-light-nits="1000" max-frame-average-light-nits="400"/>
<media:Delivery id="hdr-delivery" profile="hdr10-hevc" quality="high"
  hdr-static-metadata={hdr-metadata}/>
<film:Film id="main" canvas={vertical.canvas} timeline={program.timeline}
  appearance={recipes.film.vertical} picture={hdr-working}>
  <!-- Tracks -->
</film:Film>
<html:Video id="video" composition={main.composition}
  delivery={hdr-delivery}/>
```

The working picture says what Film values mean while contributions are composed. The Delivery
independently requests BT.2020/PQ 10-bit output and carries its explicit mastering-display and
content-light facts. Supply values that describe the intended master; Hypit does not scan the work
and guess them. The Runtime binding selects an Electron Endpoint that supports that exact request.
Do not infer working, delivery or monitoring choices from a source's tags or the current display.
The local HDR10 path accepts tagged 10-bit BT.2020/PQ video sources; HDR still images, HDR
compositable surfaces and HLG are not currently supported.

## Associate a performance with Script when its timing is consumed

Script preserves wording and meaningful events for performance-led work. When Caption, semantic
picture changes, sound events or another consumer needs their actual positions, alignment locates
them on the accepted media's local domain:

```svml
<import as="whisperx" from="@hypit/whisperx@1"/>
<import as="speechalign" from="@hypit/narrative-speech-alignment@1"/>

<whisperx:Transcription id="opening-transcription"
  media={performance-media.media} language="en"/>
<speechalign:Alignment id="opening-semantic" narrative={story}
  segment={story.segment.opening} domain={performance-media.domain}
  evidence={opening-transcription.transcript}/>
```

Set `language` to the performed language supported by the selected WhisperX Endpoint. Transcription
supplies timed evidence; the independent alignment declaration associates it with Script. The result
`opening-semantic.alignment` is `NarrativeAlignment`: Segment and Token boundaries on the named local
domain. It carries no media and no Timeline position.

When the observation needs review or correction, materialize it before the Build instead of hiding
the model response inside execution:

```bash
hypit transcribe assets/opening.mp4 --language en --to authors/opening.transcript.svml
```

```svml
<import as="accepted-speech" source="./opening.transcript.svml"/>
<speechalign:Alignment id="opening-semantic" narrative={story}
  segment={story.segment.opening} domain={performance-media.domain}
  evidence={accepted-speech.transcript}/>
```

The generated Source exports `transcript` and preserves the complete provider-neutral evidence in
16 kHz sample coordinates. If a measured word begins or ends incorrectly, edit that evidence and
build again. The requested semantic word is unchanged; only the observation used to locate it has
changed. The same alignment path therefore accepts live evidence or an edited file without a second
format or adapter.

Combine the alignment, its complete local domain and the equal-length Window in one explicit
semantic projection:

```svml
<time:Timeline id="program" clock={clock} end="opening.end">
  <time:Window id="opening" from="start" for={performance-media.extent}/>
</time:Timeline>
<semantic:Projection id="story-time" narrative={story} timeline={program.timeline}>
  <semantic:Map alignment={opening-semantic.alignment}
    domain={performance-media.domain} window={program.opening}/>
</semantic:Projection>
```

After projection, picture and sound use the ordinary prepared media with explicit absolute Windows.
They do not retain or inspect this semantic relation. Audio-only A-roll uses the same projection chain
without a dummy picture.

## Project a wordless Segment when its identity is consumed

A wordless Segment can align directly to its complete local domain without transcription when a
consumer needs that Segment's boundaries. The alignment contributes the real Segment start/end
identities and no Tokens; the media Extent can construct Timeline without it. A silent action inside
that passage needs its own authored or measured event if another component must respond to it.

## Give a still a duration when that is its role

A still B-roll Clip already occupies an authored Window. To make one or several images into a
time-bearing clip, use StillVideo:

```svml
<import as="mediaop" from="@hypit/media-operations@1"/>

<mediaop:StillVideo id="opening-still" source={product} duration="6s" clock={clock}/>
<mediaop:Prepare id="opening-media" source={opening-still.video}
  video="primary-moving" audio="none" span-authority="video"/>
```

StillVideo produces a video-only Blob. Multiple `media:Still` children divide the authored
duration by their optional weights. Preparation then makes that clip usable as prepared moving
media. Choose it when one or more held images need to become a time-bearing video Artifact; its role
is assigned by the downstream Source relationships just like any other video.

## Derive or extract media explicitly

```svml
<mediaop:Transform id="edited" source={performance-media.media}>
  <mediaop:Trim tail="0.25s"/>
  <mediaop:Retime rate="1.05"/>
</mediaop:Transform>
<mediaop:Transform id="ramped" source={performance-media.media}>
  <mediaop:Retime>
    <mediaop:Rate at="start" value="1"/>
    <mediaop:Rate at="end-1s" value="1/8"/>
    <mediaop:Rate at="end" value="1"/>
  </mediaop:Retime>
</mediaop:Transform>
<mediaop:ExtractAudio id="voice-reference" source={performance} audio="default"/>
<mediaop:ExtractFrame id="frame-reference" source={performance}
  video="primary-moving" at="last"/>
```

Transform applies its operations in order and publishes another `PreparedMedia`; trim and retime
therefore compose without creating intermediate files. A leaf `Retime` uses one non-zero rational
rate; a negative rate traverses the complete current local domain in reverse. A nested profile uses
ordered `Rate` knots across the complete source. The first and last knots name opposite edges,
intermediate positions stay strictly ordered, and each adjacent pair is integrated into an exact
target-to-source curve after the actual PreparedMedia duration is known; rate changes linearly over
that derived target interval. Use `start`, `end`, seconds
or milliseconds from either edge; native source-frame numbers are not local-time coordinates.
Extracted audio or a frame can directly
feed a compatible model reference port.
`ExtractFrame` also accepts `first`, `frame:<index>` and `time:<seconds>`.

Use graph operations for repeatable preparation belonging to the production. `hypit media` commands
are useful for inspection and deliberately exported evidence. Image geometry changes and compositing
have one installed vocabulary in `@hypit/image-operations`; select
the operation that matches the asset's intended use.

## Keep original and processed material explicit

A crop, background removal or flattened composite produces a selected asset. Preparation interprets
that output; retain the original whenever the production may still need its pixels. A transparent
video enters the same preparation and Visual Clip path as opaque video. A circular Clip or
rounded Frame instead masks Clip geometry; it does not remove the source background.

When original and processed pictures both appear, retain both and connect each as an explicit media
input. If a picture-only transformation preserves the same frame correspondence, a project
preparation component may reuse the accepted local domain and alignment while publishing a new
visual source. Author that relation in the component.

For a moving portrait, the installed `@hypit/volcengine-matting` package exposes `Portrait` with
`source={performance.video}` and publishes `cutout.video`; query its vocabulary and README for
transparent formats and current Provider support. Existing transparent material can enter Prepare
directly. Removing a still reference's background does not establish transparency in generated video.

Choose an operation for the material it actually accepts: a moving silhouette needs a video matte
or suitable keying operation; deterministic Image Operations do not silently turn it into one.
[Video direction](../playbooks/craft/video-direction.md#prepare-footage-for-subject-isolation) explains
preparing and judging footage for that use. A fixed flattened arrangement of still images can use
[Image Compose](image-operations.md#flatten-a-fixed-still-image-arrangement) when that is the desired output.

Pure trim and retime preserve the source and alpha interpretation until a consumer requests signal.
Pixel-changing operations such as matting still own their output format; read the selected operation's
output behavior rather than assuming every processed video preserves transparency.

Trimming, retiming or replacing the performance changes its local temporal relation and requires a
new local domain. Prepare new semantic timing as well when downstream consumers use it.
[Reuse boundaries](authoring.md#reuse-produced-work-explicitly) explain which completed Output can
remain selected.

Choose source proportions and framing for the actual footage the work needs. A full-frame spoken
piece can start from the final aspect ratio; a later inset or split does not dictate the generated
source shape. [Spatial layout](spatial.md) owns destination geometry. Image and video direction own
the camera view; pass those requests visible, performable facts rather than unconverted MG instructions.
