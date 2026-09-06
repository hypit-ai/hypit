# How a Hypit production fits together

Read this for the relationships that connect authoring, media, composition and execution.

SVML expresses what belongs together in a video: which media carries a passage, which picture
supports an idea, and which words or events a Caption, graphic or sound follows. Those relationships
let the production survive revision. When a performance becomes longer, a graphic attached to the
same phrase can still appear with that phrase.

## Script gives meaning; media gives it time

Script names the work's Segments, words, Selections and Moments. A Segment identifies a passage;
a Selection identifies a range within the Script; a Moment identifies a point. The author can refer
to them before a performance has been generated.

Once the media exists, normalization gives it a shared frame clock. A **SemanticTake** associates
that media with one Script Segment and records its word and boundary positions in local frames.
Speech Track assembles the Takes, translating their positions into a **SemanticTrack** for the
complete program. Its **ProgramSpace** supplies the program's time axis.

This is how “show the proof while she explains the result” becomes a precise interval in the
produced video. A wordless Segment works through the same relationship: its media supplies the
span, with start and end boundaries and no spoken words to locate.

[Script and semantic time](../creation/script-and-time.md) explains the authoring forms.
[Media preparation](media.md) explains normalization and constructing Takes.

## Components turn those relationships into picture and sound

A component gives an authored relationship its behavior. A ranking board can consume a phrase's
Selection to animate an entry; a reveal, flash and sound can share one Moment. Each interprets the
event according to its role. The board may keep the revealed answer visible after the entrance ends.

Placement and appearance have their own inputs: a Frame says where the board belongs, a Style says
how it looks, and supplied text or images say what it contains. This lets one behavior serve several
productions while each production chooses its content and art direction.

Components publish visual and audio Tracks. Film assembles the wanted Tracks into a **Composition**,
and rendering turns that composition into the delivered video. Including performance audio lets
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
