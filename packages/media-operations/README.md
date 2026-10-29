# `@hypit/media-operations`

Author declarations and graph lowering are owned by this package. Markup supplies only the public
`Prepare`, `StillVideo`, `Transform`, `ExtractAudio` and `ExtractFrame` spellings; the same operations
can be constructed through another author frontend without changing their media semantics.

Provider-neutral media preparation and execution vocabulary. Preparation contributes one ordinary
finite Fragment:

```text
Blob -> inspect-media Need -> MediaInspection
     -> deterministic MediaStreamSelection
     -> pure preparation
     -> PreparedMedia + exact LocalTemporalDomain + TemporalExtent
```

`MediaInspection` enumerates every container stream. The default moving-video policy excludes
`attached_pic` streams, prefers one declared default, accepts one unambiguous remaining candidate,
and otherwise fails closed. An explicit stream index is available when the author genuinely knows
which alternate stream is intended.

`PreparedMedia` retains the original Blob, selected members, exact local domain, display/audio
interpretation and maps back to source presentation time. It chooses no Film frame rate and contains
no execution representation. Selecting embedded audio remains a media fact only; Script meaning and program
placement stay downstream.

```svml
<time:Clock id="clock" frame-rate="30"/>
<mediaop:Prepare id="shot-media" source={shot.video}
  recipe={recipes.media.aroll}/>
```

Visual and Audio Tracks consume that prepared value with explicit Windows and sampling relations.
Visual lowering keeps the exact selected stream and composed `TemporalMap` in the terminal visual program; audio lowering
projects the selected audio source plus its preparation and occurrence maps before the terminal Audio Track enters Composition.
`@hypit/audio-program` then projects absolute programme boundaries onto its sample grid while retaining
both maps. The selected renderer evaluates them with its own decoder and working formats. An SVS
recipe may centralize stream selection without hiding the Prepare node.

A still image becomes ordinary video before it enters that waist:

```svml
<mediaop:StillVideo id="opening-still" source={opening-head.image}
  duration="6s" clock={clock}/>
<mediaop:Prepare id="opening-media" source={opening-still.video}
  video="primary-moving" audio="none" span-authority="video"/>
```

Several images spread over one literal duration the same way, each held for its share of the frames:

```svml
<mediaop:StillVideo id="kitchen-stills" duration="6s" clock={clock}>
  <mediaop:Still source={counter.image}/>
  <mediaop:Still source={basil.image} weight="2"/>
  <mediaop:Still source={board.image}/>
</mediaop:StillVideo>
```

`StillVideo` returns a video-only MP4 `Blob`, not `PreparedMedia`. Its duration is an exact
`TemporalDuration`; it must land on a positive whole frame count for the selected Clock and is never
rounded. The declaration publishes that duration and the weights as Records; `plan-still-video` divides the whole frame count among the
pictures (every picture holds at least one frame, the rest go by weight with leftovers to the largest
remainders, earlier first), `bind-still-video-source` attaches each picture in authored order, and
encoding is one `render-still-video` Need. Pictures of different sizes are fitted into the first one's
frame and letterboxed. Inspection and preparation remain the same explicit steps used by imported
or generated moving video. The resulting Blob is ordinary time-bearing visual media. Its later role
comes entirely from the downstream Source relationships; StillVideo itself owns only the authored
images, duration and frame clock.

Preparation and pure transformation use the same source-preserving boundary:

```xml
<mediaop:Prepare id="shot-media" source={shot.video}
  video="primary-moving" picture="source" audio="default" span-authority="video"/>
<mediaop:Transform id="prepared" source={shot-media.media}>
  <mediaop:Trim tail="0.25s"/>
  <mediaop:Retime rate="1.05"/>
</mediaop:Transform>

<mediaop:Transform id="bullet-time" source={shot-media.media}>
  <mediaop:Retime>
    <mediaop:Rate at="start" value="1"/>
    <mediaop:Rate at="end-1s" value="1/8"/>
    <mediaop:Rate at="end" value="1"/>
  </mediaop:Retime>
</mediaop:Transform>

<mediaop:ExtractAudio id="voice-reference" source={shot.video} audio="default"/>
<mediaop:ExtractFrame id="continuity" source={shot.video} video="primary-moving" at="last"/>
```

Transform returns another `PreparedMedia`. Ordered trim, constant retime and complete rate profiles compose exact
temporal maps without decoding or encoding. A profile's first and last `Rate` must name opposite source
edges and every intermediate `at` must remain strictly ordered. `start`, `end`, offsets such as
`end-500ms`, and exact integer, decimal or fractional rates let the declaration wait for the connected
PreparedMedia's actual duration. Adjacent Rate knots define a source interval; linear rate change over
target time is integrated exactly into one cubic source-position piece, and that interval uniquely
determines its target duration. A zero rate may occur at one knot, but two adjacent zero rates cannot
define finite time; a hold needs an explicit target duration elsewhere. Profiles do not hide cuts,
repetition or source overlap inside `Retime`.

Audio/frame extraction remain explicit Blob operations
over a source Blob. Audio extraction emits a deterministic 48 kHz stereo PCM
WAV but makes no NarrativeAlignment, speaker or semantic claim; it can therefore feed a later model
reference port directly. Frame extraction supports `first`, `last`, `frame:<index>` and
`time:<seconds>`. Transform operations are ordered author meaning and never an arbitrary FFmpeg string.

Transform exposes only constructors whose target domains are unambiguous. Trim derives its duration
from a selected source interval. Constant Retime derives it from source duration and the absolute
rate; a negative rate starts at the source end and reverses traversal. Profile Retime derives every
target segment by integrating the signed endpoint rates across its explicit source interval. These
declarations are not free-standing temporal maps: the connected PreparedMedia supplies the concrete
finite source domain, and Transform immediately resolves a named target domain and exact map.

The target-parameterized cubic relation used by Clips instead receives its target domain from the
occurrence Window. Both paths produce the same `TemporalMap` cubic pieces; their author syntax differs
because different facts are already known. Reconstruction quality remains a Renderer decision, not a
rate-profile field.

The terminal audio Programme and final audiovisual delivery are deliberately not operations on
prepared material. `@hypit/audio-program` owns Composition-to-sample-plan lowering and its renderer
capability; `@hypit/media-delivery` owns compatibility checking and mux assembly. A physical Provider
may implement all three packages' capabilities without merging their public ownership.
