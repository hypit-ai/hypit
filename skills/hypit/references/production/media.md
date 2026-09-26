# Preparing media for a production

Read this when admitting files, connecting generated media, choosing streams, or editing a clip
before using it in a component or a model reference. [Media presentation](media-presentation.md)
owns independent picture placement and playback; [Tracks](tracks.md) routes other content relationships.
For a source video at a link, read [video download](video-downloads.md).
For acquiring website screenshots, page recordings or local HTML graphics, read
[browser capture](browser-capture.md).

## Choose preparation from the intended use

Keep source facts, preparation and presentation distinct:

| Material or use | What the next consumer needs |
| --- | --- |
| Still image, including a transparent cutout | Bytes and its real dimensions for independent placement; the component supplies its display Window. |
| Video, with or without audio or transparency | Selected streams, local duration and a frame clock when entering prepared-media composition inputs. |
| Audio | The selected audio stream and prepared local time; its role can be a Script performance, music, narration or an effect. |
| Compositable surface | Its declared pixels, extent and any animation information; use the producing package's output directly. |
| Code-authored text, shapes or a scene | The component's data and resources; it can draw directly without an intermediate media file. |
| A model reference | The exact image, video or audio input accepted by that model's Surface; normalization is not a universal prerequisite. |

Files, generated Outputs and earlier Results are sources of these values. A reference need not
appear in the film. A video containing a person is not automatically a SemanticTake; the author
establishes that relationship when it performs a Script passage. [Runs](runs.md) owns explicit Result
reuse. [Image operations](image-operations.md) owns still-image preparation.

Normalization establishes moving media's frame clock, local duration and selected picture/audio
streams. A SemanticTake adds one Script passage and its local word/boundary positions.
[Timeline assembly](timeline.md) then places that Take in the work. Independent material goes to its
own component without a SemanticTake. Its presentation still uses the same Timeline for event times.

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
delivery is a Script performance, normalize and align that result as the SemanticTake below.
Independent footage can instead enter Media or another visual component, with source sound included
when the work needs it. A file cut does not choose Script or Segment boundaries. The installed Video
CLI README owns exact options and output behavior. `hypit transcribe` accepts either audio or video
when a transcript helps inspect the recording; its word times refer to that input file, while a
retained edited performance receives its own semantic alignment in the Build.

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
with an exact local frame count, optional picture and optional audio on the chosen Clock. Audio is
prepared as a 48 kHz render stem with its level preserved. Balance, fades and music ducking remain
mix decisions in [Audio Track and sound mix](../playbooks/craft/sound-mix.md).

## Use a Manim render as ordinary video

Manim remains outside the Hypit Build. After rendering, probing and watching the verified file,
declare it as an ordinary `media:Video` BlobArtifact and use the normal
[moving-media preparation](#prepare-moving-media-on-the-program-clock) and Track/Film path above.

A normal silent Manim render uses `audio="none"` during normalization. It is not a SemanticTake
unless it is explicitly associated with Script timing. The render's dimensions, frame rate,
container and pixel format remain properties to verify from the actual file; see
[Manim authoring](../creation/manim.md).

## Associate a performance with Script

For a performance-led work, including pure A-roll and short drama, prefer this path even when the
picture needs no additional graphics. Script preserves the performed wording and meaningful
passages; semantic preparation lets later presentation and revisions use their actual times.

For an already declared Script and prepared spoken performance:

```svml
<import as="whisperx" from="@hypit/whisperx@1"/>

<whisperx:SemanticTake id="opening-semantic" narrative={story}
  segment={story.segment.opening} media={performance-media.media} language="en"/>
```

Set `language` to this Take's explicit spoken language code, such as `ko` for Korean. The selected
WhisperX service chooses its language-specific alignment model; ASR size and local resource
preparation belong to the Runtime Profile. Follow [local tools](../environment/local-tools.md)
when preparing a new language. The installed `packages/whisperx/README.md` owns the exact language
expression and preparation examples.

WhisperX supplies timed speech evidence; alignment locates the authored Script in that evidence.
Script remains the wording authority, and this step establishes where its words occur in the
performance. The result `opening-semantic.take` contains the same media and that Segment's local
timing. [Timeline assembly](timeline.md) places Takes sequentially or at authored starts and
translates their local positions into Program time.
Use the performed language supported by the selected package and Endpoint.

Audio-only A-roll follows the same path with audio-only media. Its final speech can be a supplied
recording, or Voice Clone can produce it from the Segment's Script and the person's Voice Reference.
Normalize that audio with
`video="none"`, `audio="default"` and `span-authority="audio"`, then align it to the same Segment.
The resulting SemanticTake publishes semantic time and sound through Timeline assembly without inventing
a visual performance; the work's Media, Typography or MG Tracks supply the picture.

## Empty Segments use their media boundaries

An ordinary Script Segment such as `<empty></empty>` can carry a passage without words. Its prepared
media gives it a duration, so the resulting SemanticTake has the Segment's start/end Anchors and no
timed Tokens. It enters the same Timeline assembly as a spoken Take. An interval with no performance
material can instead be left open by Timeline placement or extent, with graphics authored there directly.

The semantic Surface maps an empty Segment directly to its prepared media domain:

```svml
<whisperx:SemanticTake id="pause" narrative={story}
  segment={story.segment.pause} media={pause-media.media}/>
```

This performs boundary materialization without a transcription request because the Segment has no
Tokens. Action, music or visual rhythm can determine the media duration. The ordinary SemanticTake
enters Timeline assembly alongside spoken Takes. This supplies Segment boundaries, not automatic
within-shot action detection. An event such as a silent door opening needs its own observed timing
if another component must respond to it. A simple material edit does not require inventing a Segment.

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

## Keep original and processed material explicit

A crop, background removal or flattened composite produces a selected asset. Normalization prepares
that output; it does not make original pixels recoverable through a different presentation Style.
A transparent video can enter the same SemanticTake/Timeline/Performance path as an opaque video.
A circular clip or rounded Frame instead masks a presentation geometrically; it does not remove
the subject's background from the underlying bytes.

If the whole performance should use a processed picture, prepare it before the SemanticTake and
place that Take. When both the original and processed picture appear, keep both outputs and bind the
one each presentation needs. For example, Timeline can hold the cutout while an opening Media Item
explicitly uses the original. [Performance](performance.md#choose-the-picture-actually-held-by-the-timeline)
explains that presentation boundary.

For a moving portrait, the installed `@hypit/volcengine-matting` package exposes `Portrait` with
`source={performance.video}` and publishes `cutout.video`; query its vocabulary and README for
transparent formats and current Provider support. Existing transparent material can enter Normalize
directly. Removing a still reference's background does not establish transparency in generated video.

Choose an operation for the material it actually accepts: [image background removal](image-operations.md#remove-a-background)
produces a still cutout; a moving silhouette needs a video matte or suitable keying operation.
[Video direction](../playbooks/craft/video-direction.md#prepare-footage-for-subject-isolation) explains
preparing and judging footage for that use. A fixed flattened arrangement of still images can use
[Image Compose](image-operations.md#flatten-a-fixed-still-image-arrangement) when that is the desired output.

Operation order matters to the selected implementation. The current local Media Provider's Normalize
preserves input alpha, while its Transform emits opaque MP4. When using that Transform for trimming
or retiming a cutout performance, perform it before matting. Read the selected operation's output
behavior rather than assuming every video operation preserves transparency.

A picture-only operation can preserve the accepted local timing when frames still represent the
same source instants. A project preparation component may explicitly combine that picture with the
accepted Take's audio and evidence. That is an authored computation with both inputs, not automatic
variant inheritance. Trimming, retiming or replacing the performance changes the relationship and
requires timing prepared for that result. [Reuse boundaries](authoring.md#reuse-produced-work-explicitly)
explain which completed Output can remain selected.

Choose source proportions and framing for the actual footage the work needs. A full-frame spoken
piece can start from the final aspect ratio; a later inset or split does not dictate the generated
source shape. [Spatial layout](spatial.md) owns destination geometry. Image and video direction own
the camera view; pass those requests visible, performable facts rather than unconverted MG instructions.
