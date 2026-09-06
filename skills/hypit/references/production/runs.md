# Runs, Candidates and substitutes

Read this when choosing deliverables, reusing an Output, replacing media, or preparing a layout
study before a performance exists. [Authoring](authoring.md#reuse-produced-work-explicitly) explains
which produced value still fits an edit; [Builds](builds.md) explains finding and executing it.

A Run says what this execution should complete and which existing or alternative values it should
use. A **Target** names a deliverable Output. A **Candidate** supplies an Output needed along the
way. The selected dependencies determine the work that remains.

For example, changing a title can keep the performance and its timing while producing a new final
video. The Source describes the changed title; the Run keeps the produced Take.

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

A Run Fragment connects the computations that produce a Candidate. A generic video card, for
example, needs the chosen Canvas, clock and duration:

```svrun
<import as="stand-in" from="@hypit/stand-in@1"/>
<fragment id="card" using="stand-in:video">
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
  <input name="media" from="performance-media.media"/>
  <input name="policy" from="estimated.policy"/>
</fragment>
<satisfy output="opening-semantic.take" candidate="timing.take"/>
```

Together with the card selection, this leaves card creation, inspection and normalization as the
media work. The original generated performance and WhisperX alignment are outside this preview's
selected graph. The estimator retains the real Segment, Token and Anchor identities and distributes
their positions across the prepared media's frame count. Those positions show provisional rhythm;
real alignment supplies the performance's actual word timing.

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

For an existing production with usable footage, select its Result or file directly. A generic card
is useful for spacing and timing questions; the actual shot is needed to judge overlap with a face,
color relationships, performance or identity. [Studio](studio.md) explains what the preview can show.

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

Fragment input `value` supplies a scalar: number, boolean, null or text. Structured inputs use
`from` to reference typed Author values. Exports are addressed as `instance.export`; optional
`<export name="video"/>` children choose which exports the instance exposes. Selecting an export
includes the computations that it requires.

The package's Run Fragment documentation gives its inputs and exports. Surface vocabulary queries
describe Markup tags; a Fragment-only package can therefore have no entries in that query.
