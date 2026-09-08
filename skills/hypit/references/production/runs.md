# Runs, Candidates and substitutes

Read this when choosing deliverables, reusing an Output, replacing media, or preparing a layout
study before a performance exists. [Authoring](authoring.md#reuse-produced-work-explicitly) explains
which produced value still fits an edit; [Builds](builds.md) explains finding and executing it.

A Run says what this execution should complete and which existing or alternative values it should
use. A **Target** names a deliverable Output. A **Candidate** supplies an Output needed along the
way. The selected dependencies determine the work that remains.

For example, changing a title can keep the performance and its timing while producing a new final
video. The Source describes the changed title; the Run keeps the produced Take.

One Run uses these author-facing declarations:

| Declaration | Role |
| --- | --- |
| `<author source="./main.svml"/>` | Select the Run's one Author entry. |
| `<import as="stand-in" from="@hypit/stand-in@1"/>` | Make one installed Run Fragment library available. |
| `<target output="final.video"/>` | Demand one public Author Output; several Targets may be declared. |
| `<file .../>` | Admit one project file as a typed zero-input Candidate. |
| `<build-record .../>` | Admit one exact public Output from one earlier Build Result. |
| `<value .../>` | Admit a serialized typed value from a JSON file. |
| `<fragment ...>...</fragment>` | Instantiate a package Fragment whose exports become Candidates. |
| `<satisfy output="..." candidate="..."/>` | Select one declared Candidate for one Author Logical Output. |

The required order is Header, `<svrun>`, one `author`, then Fragment imports, followed by Targets and
Candidate declarations. Runtime Profiles, Provider options, credentials, and output destinations are
not Run declarations.

## Select the Output that the current work needs

```svrun
<?svml using="@hypit/run-markup@1"?>
<svrun version="1">
  <author source="./production.svml"/>
  <target output="final.video"/>
  <build-record id="kept-take" build="bld_..." output="opening-semantic.take"/>
  <satisfy output="opening-semantic.take" candidate="kept-take"/>
</svrun>
```

Replace `bld_...` with the actual Build id found through Results. The historical `output` is the
name in that Result; the `satisfy output` is the current Author Output. Keeping this SemanticTake
preserves both media and timing when its Script identities still fit. A changed Caption or MG can
then recompute downstream.

Each Run has one Author entry. Its Targets name public computed Outputs, such as `main.composition`
for composition work, `final.video` for delivery, or an intermediate the work needs independently.
The selected graph includes the dependencies needed to complete those Outputs.

## Choose what the replacement supplies

A file can replace a byte-producing Output:

```svrun
<file id="supplied-performance" type="@hypit/artifact@1#BlobArtifact"
  from="./assets/performance.mp4" media-type="video/mp4"/>
<satisfy output="performance.video" candidate="supplied-performance"/>
```

Here the file replaces the generated video bytes. Normalization and alignment still follow it.
Selecting a completed SemanticTake instead preserves its media, Script association and timing
together. Choose the Output whose meaning matches what should stay; the receiving Type identifies
which kind of value fits that position.

## Use a Fragment when the substitute needs computation

A Run Fragment connects the computations that produce a Candidate. This composition draws one
generic Card, then asks Media Pipeline to hold it for the chosen duration with a clip-local guide:

```svrun
<import as="stand-in" from="@hypit/stand-in@1"/>
<fragment id="card" using="stand-in:timed-card">
  <input name="canvas" from="canvas"/>
  <input name="duration" value="5"/>
  <input name="clock" from="clock"/>
</fragment>
<satisfy output="performance.video" candidate="card.video"/>
```

Place imports after `author` and before execution declarations. `using` names a Fragment from an
installed package. `from` on an input names a public value of the Run's Author entry, including a
computed Output. The latter retains its own dependencies and any Candidate selection. It does not
name another Run Candidate or automatically expose an imported Source's private bindings.

The resulting Candidate is named `card.video`. Selecting it replaces the performance request while
retaining the preparation and composition that consume that video. A substitute can also consume
an existing computed Output; that Output remains part of the selected dependencies.

## Use the most representative visual evidence available

Supplied and produced images and videos are the primary visual evidence for a production. Select a
usable video itself when it exists. While an intended video is still unavailable, an actual image
from the work can be held with `media-pipeline:still-video` or
`media-pipeline:clip-time-still-video`; it carries real subject, color and camera evidence into the
composition, although it cannot establish the future motion or performance. A generic Card is useful
only when no suitable pixels exist and a current component or wiring question is worth answering
before generation completes.

For example, keep a previously produced presenter image, give it provisional clip time, and use that
video Candidate at the position where the future performance will enter:

```svrun
<import as="media" from="@hypit/media-pipeline@1"/>
<build-record id="presenter-image" build="bld_..." output="presenter.image"/>
<satisfy output="presenter.image" candidate="presenter-image"/>

<fragment id="held-presenter" using="media:clip-time-still-video">
  <input name="duration" value="5"/>
  <input name="clock" from="clock"/>
  <input name="source" from="presenter.image"/>
</fragment>
<satisfy output="performance.video" candidate="held-presenter.video"/>
```

Preview choices answer the question that exists now; they are not a sequence of production states.
A production may skip them entirely, use one while media is being generated, or replace one as soon
as more representative media is available. The Card normally loses its purpose first. A held image
used in place of future motion loses that purpose when the video exists. Run Candidate selection
makes each choice explicit without inventing an acceptance or promotion workflow.

## A complete layout preview

The small [production Source](examples/production.svml), [Recipe](examples/look.svs),
[production Run](examples/production.svrun) and [preview Run](examples/preview.svrun) demonstrate
the same Film with two execution choices. Copy the files together into a video project to study or
adapt them. Their simple performance request illustrates system wiring; the actual video's casting,
references and direction come from its Treatment and the relevant Playbook.

The Source declares measured timing and an estimated alternative. The estimated Surface publishes
its authored `estimated.policy` as a typed value. The preview Run uses the estimate package's Run
Fragment to supply the Candidate for the original measured Take:

```svrun
<fragment id="timing" using="estimate:semantic-take">
  <input name="narrative" from="story"/>
  <input name="segment" from="story.segment.opening"/>
  <input name="media" from="performance-preview-media.media"/>
  <input name="policy" from="estimated.policy"/>
</fragment>
<satisfy output="opening-semantic.take" candidate="timing.take"/>
```

Together with the card selection, this leaves Card drawing, StillVideo rendering, video-only
normalization and timing estimation as the media work. The original generated performance and
WhisperX alignment are outside this preview's selected graph. The estimator retains the real
Segment, Token and Anchor identities and distributes their positions across the prepared media's
frame count. Those positions show provisional rhythm; real alignment supplies the performance's
actual word timing.

From the directory containing the copied example:

```bash
hypit check preview.svrun
hypit plan preview.svrun
hypit-studio --run preview.svrun
```

Studio can materialize this preview with a selected local media Provider that supports the required
transient capabilities. If the chosen environment does not provide them for Studio, build the
selected preview media through that environment and reuse its completed Outputs. The normal
production Run still requests generation and measured alignment, under the work's spending authority.

For an existing production with usable footage, select its Result or file directly. If only an
authored or generated picture exists, StillVideo gives downstream composition more relevant pixels
than a Card. The held picture can establish its own identity, color and framing; the actual shot is
the evidence for motion, performance and the changing relationship between a face and graphics.
[Studio](studio.md) explains what the selected preview can show.

## Preserve the choices that still apply

Retain unrelated `satisfy` declarations when adding a new choice. Removing one restores the Author
computation for that Output. A new Build does not infer reuse from matching names or unchanged prompts.
Read the plan to see whether the changed selection leaves the intended generation, preparation and
rendering work. [Rendering](rendering.md) explains why a short render interval still needs explicit
upstream reuse.

## Other value and export forms

`<value id="settings" type="@owner/module@1#Settings" from="./settings.json"/>` admits a typed
serialized value as a Candidate. The file contains a StoredValue wrapper, for example
`{"kind":"inline","value":{"enabled":true}}`. The inner value must match the declared Type.
Use `build-record` for structured Outputs already held in Results, where their associated media
resources can be resolved with them.

A Composite export's `value.json` is a Result value document with separate resource bindings, not
this StoredValue wrapper. [Project handoff](../creation/project-files.md#hand-over-an-editable-production)
explains retaining its Result for structured reuse in another project location.

Fragment input `value` supplies a scalar: number, boolean, null or text. Structured inputs use
`from` to reference typed Author values. Exports are addressed as `instance.export`; optional
`<export name="video"/>` children choose which exports the instance exposes. Selecting an export
includes the computations that it requires.

The installed package's Run Fragment documentation gives its package-specific inputs and exports.
Surface vocabulary queries describe Markup tags; a Fragment-only package can therefore have no
entries in that query.
