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
<import as="mediaop" from="@hypit/media-operations@1"/>
<import as="whisperx" from="@hypit/whisperx@1"/>
<import as="speechalign" from="@hypit/narrative-speech-alignment@1"/>
<import as="semantic" from="@hypit/narrative-temporal@1"/>
<import as="media" from="@hypit/media@1"/>

<time:Clock id="clock" frame-rate="30"/>
<mediaop:Prepare id="cutout-media" source={cutout.video}
  video="primary-moving" audio="default" span-authority="video"/>
<whisperx:Transcription id="opening-transcription"
  media={cutout-media.media} language="en"/>
<speechalign:Alignment id="opening-alignment" narrative={story}
  segment={story.segment.opening} domain={cutout-media.domain}
  evidence={opening-transcription.transcript}/>
<time:Timeline id="speech" clock={clock} end="opening.end">
  <time:Window id="opening" from="start" for={cutout-media.extent}/>
</time:Timeline>
<semantic:Projection id="story-time" narrative={story} timeline={speech.timeline}>
  <semantic:Map alignment={opening-alignment.alignment}
    domain={cutout-media.domain} window={speech.opening}/>
</semantic:Projection>
```

This excerpt assumes the performance and Script exist. Prepare preserves the selected transparent
picture, audio and exact source relation for composition. The current WhisperX input is adapted
separately from media preparation; it associates the Script Segment with the prepared local domain. Timeline
uses the prepared Extent while semantic projection consumes the equal-length speech-domain/Window
relation. Use `cutout-media.media` with `during={speech.opening}` in independent Visual and Audio
Clips. Screen position and stack order remain visual choices.

For independently timed footage, prepare `cutout.video` with `audio="none"` when its sound is
unwanted, then use `cutout-media.media` in a [Visual Clip](../visual-track/README.md). No semantic
alignment is needed for that overlay. Existing transparency can enter Prepare directly.

For example, this alternative uses the existing program's Timeline and an authored Selection:

```svml
<import as="visual" from="@hypit/visual-track@1"/>
<mediaop:Prepare id="overlay-media" source={cutout.video}
  video="primary-moving" audio="none" span-authority="video"/>
<visual:Track id="overlay" timeline={speech.timeline}>
  <visual:Clip media={overlay-media.media} during={example}
    frame={overlay-frame} fit="contain" treatment={look.visual.overlay}/>
</visual:Track>
```

The Frame, treatment Recipe and Selection belong to the composition. Add `overlay.visual` to Film
with the desired `<film:Track id="...">`; that parent membership names the occurrence, while its sibling position sets paint order. The
performance underneath continues to supply semantic time.

The same processed clip can serve either role; matting does not choose its Track or timeline. When
a cutout needs trimming or retiming in the composition, apply `mediaop:Transform` to its prepared
media. The relation remains lazy until a visual or audio consumer requests signal.

Review motion, hair, hands, translucent edges and the selected speech against the intended
background. Export an accepted `cutout.video` into the project and select that authored asset when changing placement,
captions or graphics.

## Model and Provider

The capability is `@hypit/volcengine-matting@1#matte-portrait-video`, returning a GeneratedVideoSet.
The Portrait declaration publishes its first video as `.video`. Its model fields are `source`
(one video) and `format` (`WEBM` or `MOV`). Authors may omit `format`; Model request finalization
then writes `WEBM` explicitly before any Provider sees it. It takes no generation prompt or duration.

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
