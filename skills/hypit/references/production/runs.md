# Runs, Targets and reuse

Read this when choosing deliverables, reusing an Output, or selecting media for an execution. [Authoring](authoring.md#reuse-produced-work-explicitly) explains
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
| `<import as="media" from="@hypit/media-pipeline@1"/>` | Make one installed Run Fragment library available. |
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

## Use a Fragment when a Candidate needs computation

A Run Fragment connects computations that produce a Candidate. For example, an authored still image
can become a timed video through Media Pipeline's ordinary `still-video` Fragment:

```svrun
<import as="media" from="@hypit/media-pipeline@1"/>
<fragment id="product-hold" using="media:still-video">
  <input name="duration" value="5"/>
  <input name="clock" from="clock"/>
  <input name="layout" from="product-layout"/>
  <input name="source-0" from="product-image"/>
</fragment>
<satisfy output="product-clip.video" candidate="product-hold.video"/>
```

Here `product-layout` is an Author value of Type `@hypit/media-pipeline@1#StillVideoLayout`,
containing `{"weights":[1]}`; `product-image` is an authored image Blob. The package README owns the
Fragment's exact inputs. [Media](media.md#give-a-still-a-duration-when-that-is-its-role) shows the
simpler `StillVideo` Surface for authoring this directly in the Source.

Place imports after `author` and before execution declarations. `using` names a Fragment from an
installed package. `from` on an input names a public value of the Run's Author entry, including a
computed Output. The latter retains its own dependencies and any Candidate selection. It does not
name another Run Candidate or automatically expose an imported Source's private bindings.

The resulting Candidate is named `product-hold.video`. Selecting it replaces the computation at
`product-clip.video` while retaining the preparation and composition that consume that video.

## Generate material while composing

Media requests depend on the Script, direction, references and requested duration. Once those
choices are ready and the commission covers their cost, a Run can target the prepared Takes while
component and Recipe work continues. Shared decisions such as where a presenter leaves room for
an overlay belong in Treatment and image direction; encode them in both the material and composition.

The small [production Source](examples/production.svml), [Recipe](examples/look.svs),
[material Run](examples/material.svrun) and [production Run](examples/production.svrun) illustrate
these execution choices. Copy them together into a project. The simple performance request shows
system wiring; the work's actual casting, references and direction come from its Treatment and Craft.

`material.svrun` targets `opening-semantic.take`. While it runs, the author can work on the title and
its placement. Once the Take completes, select it with `build-record` in the production Run so that
rendering uses the produced performance and its word timing. If material is already available, use
it directly. Choose Targets according to the dependencies the current work needs.

For a focused composition change, [detail.svrun](examples/detail.svrun) targets frames 30–90 from the
same Source and reuses that Take. Replace its example Build id with the actual Result id. The new
Build evaluates the changed composition and selected render interval. The final Run can reuse the
same Take for full delivery.

[Rendering](rendering.md#choose-a-render-interval-in-frames) explains frame ranges and reuse;
[Review](review.md) explains judging the actual arrangement. [Studio](studio.md) provides an
interactive view when playback, parameter editing or a component's Companion is useful.

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
