# @hypit/bach

Model request definitions and SVML Surfaces for [Bach 1.0 Pro](https://www.bach.art/api/docs/bach_1_0_pro).
The exact model capability is `bach-1.0-pro`, corresponding to the API model name `Bach-1.0-Pro`.
The package owns input validation and graph dependencies. A Runtime Endpoint supplies execution.

```xml
<import as="bach" from="@hypit/bach@1"/>

<bach:TextVideo id="opening" prompt={prompt} duration="5.5" resolution="1080p" aspect-ratio="16:9"/>
<bach:FrameVideo id="transition" prompt={prompt} first-frame={opening.image} last-frame={ending.image}/>
<bach:ReferenceVideo id="scene" prompt={referencePrompt} duration="8" resolution="4k" generate-audio="true" seed="1101">
  <bach:Reference image={subject.image}/>
  <bach:Reference video={motion.video} start-time="1.5"/>
  <bach:Reference audio={sound.audio}/>
</bach:ReferenceVideo>
```

Each element produces `<id>.video`. Prompts reference Text Artifacts and must contain non-whitespace
text, up to 6500 characters. Duration accepts decimals from 5 to 16 seconds and defaults to 5.
Billing and reported usage round up to the next whole second. Resolution is `1080p` (default) or `4k`.
Audio generation defaults to `true`. An optional seed is an integer from 1 to 100000.

`TextVideo` and `ReferenceVideo` accept `aspect-ratio`: `4:3`, `3:4`, `16:9`, `9:16`, `21:9`, `1:1`
or `auto`, defaulting to `16:9`. `FrameVideo` requires a first frame, a last frame, or both,
and always uses `auto` for its aspect ratio. Any supplied `aspect-ratio` is treated as `auto`.
Each frame must be 10 MB or smaller.

`ReferenceVideo` requires at least one image or video. It accepts up to 9 images, 3 videos and
3 audio files, with at most 12 references in total. Each empty `Reference` selects exactly one
Artifact and accepts an optional nonnegative `start-time` offset in seconds. The prompt addresses
references as `@Image1`, `@Video1` and `@Audio1`, numbered separately for each media type.

Reference media requirements from the [task documentation](https://www.bach.art/api/docs/create_task):

- Images: JPG/JPEG, PNG or WEBP, 480 to 2048 pixels per dimension, at most 10 MB each.
- Videos: MP4 or MOV with H.264/AVC or H.265/HEVC video and AAC or MP3 audio, 480 to 2048 pixels
  per dimension, at most 30 MB each.
- Audio: WAV or MP3, at most 15 MB each.
- Each video or audio clip lasts 2 to 15 seconds; video references total at most 15 seconds,
  and audio references total at most 15 seconds.

The package checks declared media types and file sizes when Blob metadata is available.
Asset preparation must satisfy the documented dimensions, durations and codecs.
The Bach API requires publicly reachable HTTP/HTTPS media URLs; a Provider maps the Artifact
inputs to those URLs and the model's wire fields.
