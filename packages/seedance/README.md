# `@hypit/seedance`

Exact Seedance author model module. It owns the request schema and exactly three invocation declarations;
it does not contain service credentials, HTTP code, queues, runtime routing or usage-specific Prompt assembly.

Its implementation uses the public Hypit author APIs and the `@hypit/generation` model APIs. The repository keeps
TypeScript source entry points for joint development; `npm run pack:independent -- packages/seedance`
builds the owner package into a temporary release directory whose exports and activation point at compiled
JavaScript. The resulting tarball contains no private Hypit workspace dependency or second copy of the Host.
The npm version selects those package bytes; Source continues to address the logical Module as
`@hypit/seedance@1`.

The official Hypit Distribution currently declares this package as a default npm dependency rather
than embedding its source. A project may explicitly install another compatible version; the ordinary
project lockfile records the actual selection.

The three model invocation shapes are deliberately separate:

- `TextVideo`: Prompt only; this is the only shape that exposes Web Search.
- `FrameVideo`: required first frame and optional last frame.
- `ReferenceVideo`: one or more image, video or audio references within the Model's field limits.

All three preserve the remote result as one atomic `GeneratedVideoSet`, then expose its first ordered
member as an ordinary `Blob`. Their prompt fields consume ordinary `Text`, so a Script projection,
generic Text Template or third-party author module can feed them without becoming part of Seedance.

`standard`, `fast`, `mini` and `2.5` select model variants independently of the invocation shape.
Duration is the author's literal inside the model's declared range: `standard`, `fast` and `mini`
accept 4–15 whole seconds, while `2.5` accepts 4–30 whole seconds or `-1` for its automatic source-edit
contract. Measure a spoken line first with `hypit estimate` when the request is sized by delivery and
write the number here. Nothing in the graph computes it, so a Build plan is complete before it starts.

## Video reference relationships

All four variants expose video references through `ReferenceVideo`. A video reference can transfer a
named temporal property—such as motion, camera behavior, performance rhythm or effect evolution—while
the request creates new material. Seedance 2.5 can also treat a supplied video as the material being
edited while preserving the relationships the prompt does not ask to change. For that strict
source-edit relationship, author `duration="-1"` and `aspect-ratio="adaptive"`:

```xml
<seedance:ReferenceVideo id="edit" model="2.5" prompt={direction}
  duration="-1" aspect-ratio="adaptive">
  <seedance:Reference video={source.video} person-reference="true"/>
</seedance:ReferenceVideo>
```

This pair is not a default for every video reference or every clone. Use an ordinary authored
duration and aspect ratio when the request is transferring selected behavior into newly generated
material. The selected Provider owns whether and how it implements each exact model contract.

## Reference audio

The Seedance package rejects reference audio declared as `audio/mp4` or `audio/x-m4a`. Convert the
audio to WAV or MP3 before using it; `media:ExtractAudio` produces WAV and can consume an upstream
component's media output. Renaming a file or changing its declared media type is not conversion.

Known imports are checked during declaration compilation. Future audio stays a graph input and is checked
when its Blob arrives. The same rule applies to drafts, complete requests, planning and direct
generation Producers. `sealSeedanceRequest` uses the endpoint's model-aware request builder;
`seedanceComponent` and `seedanceDefinition.component` expose the same implementation.

This checks the Blob's declared media type, not its bytes or codec. The selected Provider remains
responsible for any additional service-specific input limits.

## Visual reference metadata

Every supplied image or video must explicitly declare `person-reference`: `true` if it contains
a person, `false` otherwise. Classify the supplied material, not the requested result.

```xml
<seedance:ReferenceVideo id="take" model="mini" prompt={direction} duration="8">
  <seedance:Reference image={presenter.image} person-reference="true"/>
  <seedance:Reference video={presenter.video} person-reference="true"/>
  <seedance:Reference image={room.image} person-reference="false"/>
</seedance:ReferenceVideo>
```

Missing or non-boolean declarations are rejected; there is no default or automatic face detection.
Audio must omit this field. `FrameVideo` requires `first-frame-person-reference` and, when a last
frame is supplied, `last-frame-person-reference`. A last-frame classification requires a last frame.

| Supplied visual input | Authored attribute | Request field |
| --- | --- | --- |
| Each `Reference image={...}` | `person-reference` | `referenceImage` |
| Each `Reference video={...}` | `person-reference` | `referenceVideo` |
| `FrameVideo` first frame | `first-frame-person-reference` | `firstFrame` |
| `FrameVideo` last frame | `last-frame-person-reference` | `lastFrame` |

These forms apply to `standard`, `fast`, `mini` and `2.5`. For example:

```xml
<seedance:FrameVideo id="turn" model="fast" prompt={direction} duration="5"
  first-frame={presenter.image} first-frame-person-reference="true"
  last-frame={empty-room.image} last-frame-person-reference="false"/>
```

Inspect the selected video excerpt, not only its opening frame. An empty room stays `false` when
the prompt asks to add a person. The flag does not lock identity; direction and references own that.

The SVML author declares this parameter on each reference input. Admitted files, generated
images/videos and reused Results use the same attributes. For a future output, declare the intended
reference classification explicitly; if its contents are uncertain, generate and inspect that
material before using it downstream.

Direct requests require the same boolean in `fields.personReference`. Providers interpret it through
their service's media handling; it is not a prompt sentence or a Core-level identity. HypiHub sends it as
`is_person_reference` when uploading the file, then uses the returned URL in the ordinary video
request. A project Provider maps it according to its own API.

Video references can carry motion or camera behavior while image references carry the target
appearance. Request duration and reference-clip duration are different limits. Check the selected
Endpoint's reference duration and media limits when choosing an excerpt; the author's output duration
alone does not validate the input clip.
