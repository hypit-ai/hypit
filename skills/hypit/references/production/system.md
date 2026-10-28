# How a Hypit production fits together

Read this when deciding which relationship owns material, meaning, time, space, picture, sound or
delivery. [Production navigation](index.md) routes each relationship to its detailed authoring page.

## Material becomes useful through explicit relationships

A supplied file, generated Output and reused Result can provide the same material Type. Prepare
timed media to select its streams, establish a finite exact local temporal domain and publish its Extent.
The work then decides how to use those facts.

For spoken work, Script names meaningful passages and events. `NarrativeAlignment` locates one
Segment on a source-local domain. The prepared medium supplies picture and sound. Connect the
recording to alignment, picture and sound according to the relationships the production uses.

A-roll names the performance carrying a passage. Its picture may fill the frame, move, disappear or
be absent while its sound and semantic relationships continue. B-roll, generated shots, imported
pictures, narration, music and effects each connect their media to the role they serve.
[Media preparation](media.md) owns supplied material, preparation and processed variants.

## Timeline publishes absolute time

Timeline supplies the work's finite frame domain and the named Instants and Windows the author wants
to share. Its author graph can use known durations or Extents resolved after media generation.

Semantic timing is one source of absolute values. A Narrative projection combines Alignment, its
local domain and an equal-length Timeline Window, then publishes the requested Selection, Moment or
Segment boundaries as ordinary Instants and Windows. Project and ecosystem packages can offer
parallel projectors for musical beats or other local domains. Components consume the resolved values.

[Timeline](timeline.md) owns construction; [Timing](timing.md) owns choosing direct or projected time
and the forms accepted by components.

## Canvas publishes picture coordinates

Canvas supplies the final dimensions and coordinate system. A Frame identifies a destination;
SpatialMap2D identifies how source geometry reaches it. Components own the layout and motion shared
by their internal objects, while independent visual contributions remain peers.

Time, visual scope and paint order are separate choices. One scene can respond to several events,
and several components can respond to the same event. [Spatial layout](spatial.md) owns geometry;
[component design](component-design.md) owns useful visual scope.

## Visual and Audio Clips place media occurrences

A Visual Clip combines one picture source, an absolute Window, a destination Frame and source
sampling. Its declaration contributes to Track-local item order; Film separately places the complete
VisualTrack through a named parent membership. An Audio Clip combines one audio source, an absolute Window, source sampling and
mix treatment. One prepared medium can supply both occurrences.

Keep three times distinct:

- Timeline time locates the contribution in the film;
- temporal sampling selects a position in prepared media;
- component-local time drives its visible state.

An ordinary picture handoff between two adjacent overlapping Visual Clips is an explicit Visual
Transition. Behavior beyond that relation—such as a continuing presenter, slideshow, shared mask,
cross-Track handoff, visual/audio transition or ducking relationship—belongs to a component. It can
publish ordinary VisualTrack and/or AudioTrack outputs for Film. [Tracks](tracks.md) routes ordinary
Clips, Transitions and richer components.

Caption is another peer relation: a document owns displayed Words, correspondence Units and authored
Cues; CaptionTiming owns complete absolute Unit boundaries; and a Caption family owns visible
scheduling, layout, motion and drawing without redefining Cue membership.

## Give each part the direction it can realize

Keep the whole creative intention in Treatment, then translate it into the facts each producer can
realize. An image or video request needs visible subjects, setting, framing, action, camera behavior
and reference roles. A voice request needs audible character, delivery and language. A component
needs its content, Frame, events and the treatment choices its behavior exposes.

Composition goals still guide these inputs: a generated presenter can leave useful room for a later
diagram, and a voice can carry the attitude the edit should support. State that consequence as a
property of the requested material, then author the later relationship through its actual component,
time and space inputs. Review the accepted material before relying on a detail the producer did not
establish.

## Components preserve shared behavior

A component owns content that needs shared layout, state or motion. Its inputs connect real
dependencies and useful directing choices: assets, important events, placement and treatment.
Decorative geometry and fixed local design can remain internal.

Responsibility, parameterization and distribution are separate. A one-off project scene can be a
well-formed component with few controls; cross-project reuse is decided only when it becomes useful.
[Component design](component-design.md) explains that boundary, and [Track authoring](track-authoring.md)
implements it.

Film explicitly selects its Timeline, Canvas and required visual/audio outputs. Source nesting,
component scope, paint order and execution dependencies keep their own meanings.

## Source, Run, Runtime and Studio

Author Source connects material requests, time and space values, components and deliverables.
Recipes hold reusable treatments. A Run selects public Outputs as Targets and can reuse exact files
or completed Result Outputs as Candidates. Reuse the narrowest value whose facts still serve the
current edit.

A Build executes the demanded graph and records completed public Outputs in its Result. Runtime
Profiles select already installed Providers, Endpoints and credentials for external work.

Studio reads the authored and executed relationships exposed by the selected packages. Companions
give useful Items and controls to a component by following its real inputs and outputs.
[Authoring](authoring.md), [Runs](runs.md), [Builds](builds.md) and [Studio](studio.md) own those workflows.
