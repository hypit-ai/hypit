# Narratage surface mapping

Use this map when translating an editorial playbook into SVML. These are current package surfaces,
not aliases for the old canvas/JSON workflow.

| Editorial need | Narratage author surface |
|---|---|
| Story and dialogue | `Script`, `Segment`, `Role Cue`, `Selection`, `Moment` |
| Prompt or reusable copy | `text:Value` and `text:Render` (backed by Text Templates) |
| Reusable Seedance prompt contract | vendored `speaker-v1`, `broll-v1`, `podcast-v1`, `call-v1`, `street-interview-v1`, `motion-reference-v1`, or `camera-reference-v1` Kit + SVS Recipe |
| Generated image | `gpt:Image`, `nano:Image`/`nano:ProImage`, or `seedream:TextImage`/`ReferenceImage` |
| Text-to-video | `seedance:TextVideo` |
| First-frame-to-video | `seedance:FrameVideo` |
| Reference-image/audio-to-video | `seedance:ReferenceVideo` |
| Ordered speech-video assembly | `speech:Spine` with `speech:Take` children |
| Measured speech timing | `whisperx:Alignment` → `{timing.map}` |
| Caption policy | `caption:Program` |
| Caption planning/rendering | `caption-ai:Planner` + `caption-fine:Track` |
| B-roll, PIP, supplied media | `media-track:Track` + `media-track:Item` |
| Editorial titles/callouts | `text:Track` + `text:Area`/`text:Point`/`text:Path` |
| Music, voiceover, SFX | `audio:Track` + `audio:Clip` |
| Ranking/listicle visuals | an official `ranking:Column`/`TierBoard`/`TopThree`/`TypewriterList` or `deck:DepthStack` surface |
| Final composition | `film:Film` + `film:Track` |
| Video output | `render:Video` |
| Reusable run/build definition | `.svrun` Run Source, `Target`, and Runtime Profile |

## Timing rule

Use `during="program"` or explicit `start`/`end` for absolute author-time placement. When speech
timing is available, use `during={story.selection.<id>}` for a range or `at={story.moment.<id>}`
with the component's duration attribute (for example `for="2s"`). A Selection/Moment is semantic
and is resolved through `{timing.map}`; it is not a literal transcript query or a source-video
timestamp.

## Translation rule

Editorial concepts map to the nearest supported package surface. Do not invent a native component
for a format that Narratage does not ship: use supplied media plus peer Tracks, or record the gap.
Do not add a storyboard JSON layer or a conversion script between VLM analysis and `.svml`.
