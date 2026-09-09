# How a Hypit production fits together

Read this for the relationships that connect authoring, media, composition and execution.

SVML expresses what belongs together in a video: which media carries a passage, which picture
supports an idea, and which words or events a Caption, graphic or sound follows. Those relationships
let the production survive revision. When a performance becomes longer, a graphic attached to the
same phrase can still appear with that phrase.

Semantic authoring is the preferred starting point for a Hypit production, including a clone.
Understand which idea, question, answer or action each layer serves. Express that relationship in
the target's Script and components, then project it through the new media. For example, a product
picture follows the explanation of its benefit and a graphic settles when the speaker gives the
verdict. The reference's seconds locate evidence; the target's actual performance supplies its time.

## Script gives meaning; media gives it time

Script names the work's Segments, words, Selections and Moments. A Segment identifies a passage;
a Selection identifies a range within the Script; a Moment identifies a point. The author can refer
to them before a performance has been generated.

Once the media exists, normalization gives it a shared frame clock. A **SemanticTake** associates
that media with one Script Segment and records its word and boundary positions in local frames.
Speech Track assembles the Takes, translating their positions into a **SemanticTrack** for the
complete program. Its **ProgramSpace** supplies the program's time axis. A pure graphic animation can
instead declare a ProgramSpace directly and draw each frame through components; it needs no performance media.

In spoken work, the performance carrying the main Script is the A-roll. A single presenter, a
conversation with several speakers, and an independent narration can each carry this spine.
Covering the speaker with B-roll does not change whose words establish time. Speech Track assembles
the relevant Takes into one semantic timeline and publishes their original audio. Media or a project
component obtains the prepared picture from that semantic performance and decides how to present it.
The speaker can occupy a small circular inset or appear as a cutout above a full-screen demonstration.
That speaking performance still supplies the SemanticTake. A-roll describes this semantic role;
screen area and stacking belong to its visual presentation.

This is how “show the proof while she explains the result” becomes a precise interval in the
produced video. A wordless Segment works through the same relationship: its media supplies the
span, with start and end boundaries and no spoken words to locate.

[Script and semantic time](../creation/script-and-time.md) explains the authoring forms.
[Media preparation](media.md) explains normalization and constructing Takes.

## Components turn those relationships into picture and sound

Choose each relationship at the scale that makes it useful. Script describes what an event follows;
Frames describe placement; a component owns shared layout, state and motion. The dependency graph
says which values that work needs. These structures can differ: a Source element can produce several
appearances, and one appearance can contain a whole scene of video and graphics.

A component gives an authored relationship its behavior. A ranking board can consume a phrase's
Selection to animate an entry; a reveal, flash and sound can share one Moment. Each interprets the
event according to its role. The board may keep the revealed answer visible after the entrance ends.

Placement and appearance have their own inputs: a Frame says where the board belongs, a Style says
how it looks, and supplied text or images say what it contains. This lets one behavior serve several
productions while each production chooses its content and art direction.

Visual and audio components publish Tracks. A visual Track groups named appearances; each appearance
owns its lifetime, paint order and internal element tree. A moving video and its diagram can form
one scene, with independent Caption beside it. Media provides ordinary presentation, and a project
component can own the shared behavior of a more specific scene. [Component design](component-design.md)
explains that choice; [drawing a component](component-visuals.md) shows both structural elements and
HTML/CSS programs with frame-driven behavior.

Film assembles the wanted Tracks into a **Composition**, and rendering turns that composition into
the delivered video. Including performance audio lets
it continue under B-roll; a silent covering picture changes only the visible layer.

[Tracks](tracks.md) explains the available roles. [Spatial layout](spatial.md) and
[fonts and text](fonts-and-text.md) explain their shared inputs. A new role can be implemented as a
[project component](track-authoring.md) and included through the same composition model.

## Source describes the work; Run selects this execution

The Author Source connects the Script, media requests, components and deliverables. Recipes hold
reusable authored choices such as Styles or prompt configurations. The connections form a dependency
graph: completing the final video requires the values used to make it.

A **Run** selects which public Outputs to complete through **Targets**, and can choose a different
**Candidate** for an Output. That Candidate might be a supplied file, a prior Result, or a computation
provided by a Run Fragment.

For a Caption revision, keep the existing SemanticTake and target the final video. The selected Take
already supplies the performance and its timing; the changed Caption and downstream rendering remain
work to do. This separates revising the video from repeating media generation. The Run records that
reuse explicitly.

A submitted execution is a **Build**. Its **Result** retains completed public Outputs for inspection,
delivery and future selection, including useful Outputs completed before a later failure.

[Source syntax](source-syntax.md) explains declarations and references. [Runs](runs.md) explains
selection and substitutes. [Builds and Results](builds.md) explains submission and retrieval.

## Runtime supplies the execution facilities

Some computations arrange values; others require media tools or external services. The latter
produce a **Need** describing that work. A model package defines a request's meaning, and a Provider
implements the corresponding capability through an Endpoint. The Runtime Profile selects the
facilities, credentials and capacity used to execute it.

For example, the Source declares the composition and requested render interval; the local
HyperFrames Provider's configuration chooses its worker count. A production can keep its authored
relationships while using the execution setup selected for it.

[Runtime profiles](../environment/profile.md) explains those choices. [Rendering](rendering.md)
explains whole and partial video outputs. [Studio](studio.md) provides interactive inspection and
editing of the same authored work with its selected media.
