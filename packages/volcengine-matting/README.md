# `@hypit/volcengine-matting`

Remove the background of a moving portrait when the composition needs the person's silhouette
over another picture. The source video determines the performance, duration and dimensions.

```svml
<import as="matte" from="@hypit/volcengine-matting@1"/>
<matte:Portrait id="cutout" source={performance.video}/>
```

`source` is a video Blob from a file declaration, generation or another media operation.
`cutout.video` is the processed video Blob. `format="WEBM"` is the default; `format="MOV"`
selects a transparent QuickTime output. This interface exposes the model's two transparent
formats. The service's flat-background MP4 option is a different output treatment.

## Prepare the processed clip for its role

```svml
<import as="program" from="@hypit/program-space@1"/>
<import as="pipeline" from="@hypit/media-pipeline@1"/>
<import as="whisperx" from="@hypit/whisperx@1"/>

<program:Clock id="clock" frame-rate="30"/>
<pipeline:Normalize id="cutout-media" source={cutout.video} clock={clock}
  video="primary-moving" audio="default" span-authority="video"/>
<whisperx:SemanticTake id="opening-semantic" narrative={story}
  segment={story.segment.opening} media={cutout-media.media} language="en"/>
```

This excerpt assumes the performance and Script exist. Normalize keeps the transparent picture
and prepares the selected embedded audio on the program clock. WhisperX and semantic alignment
associate that prepared performance with the Script. Use `opening-semantic.take` in
[Speech Track](../speech-track/README.md); its screen position and stack order are independent
of its role as A-roll.

For B-roll, normalize `cutout.video` with `audio="none"` when its sound is unwanted, then use
`cutout-media.media` in [Media Track](../media-track/README.md). No SemanticTake is needed for
that overlay. Existing transparency can enter Normalize directly.

For example, this alternative uses the existing program's SemanticTrack and an authored Selection:

```svml
<import as="media-track" from="@hypit/media-track@1"/>
<pipeline:Normalize id="overlay-media" source={cutout.video} clock={clock}
  video="primary-moving" audio="none" span-authority="video"/>
<media-track:Track id="overlay" semantic={speech.semantic} canvas={canvas}>
  <media-track:Item media={overlay-media.media} during={story.selection.example}
    frame={overlay-frame} appearance={look.media.overlay}/>
</media-track:Track>
```

The Frame, Recipe and Selection belong to the composition. Add `overlay.visual` to Film and set
its stacking order in the Recipe. The performance underneath continues to supply semantic time.

The same processed clip can serve either role; matting does not choose its Track or timeline.
The local media Provider's Transform currently emits opaque MP4. When a clip also needs trimming
or retiming, apply that operation before matting, then normalize the cutout for its intended role.

Review motion, hair, hands, translucent edges and the selected speech against the intended
background. Reuse `cutout.video` or the prepared Output through the Run when changing placement,
captions or graphics.

## Model and Provider

The capability is `@hypit/volcengine-matting@1#matte-portrait-video`, returning a GeneratedVideoSet.
The Portrait Surface publishes its first video as `.video`. Its model ports are `source`
(one video) and optional `format` (`WEBM` or `MOV`). It takes no generation prompt or duration.

[HypiHub Provider](../provider-hypihub/README.md) maps it to `POST /v1/videos` with
`model: "matte-portrait-video"`, `ref_video_url` and `format`. Account availability and credentials
belong to the selected Runtime Endpoint. Submission, job polling, collection and Result storage
use that Provider's existing video operation.

To select this route explicitly in a Runtime Profile, bind the capability to an existing
HypiHub Endpoint:

```json
{
  "bindings": {
    "@hypit/volcengine-matting@1#matte-portrait-video": "hypihub.default"
  }
}
```

Here `hypihub.default` is the Endpoint ID from that profile. The Model describes the operation;
the Provider translates it to the service; the Endpoint supplies the account and execution settings.
No source duration or resolution needs to be copied into the Source or Runtime Profile.

The input and output formats follow [Volcengine's portrait-matting reference](https://github.com/volcengine/mediakit-cli/blob/main/skills/byted-mediakit-video/reference/matte-portrait-video.md).
