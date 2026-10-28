# Runs and Targets

Read this when choosing the Outputs for one execution or saving a repeatable execution preset.
[Authoring](authoring.md) explains the production Source and durable material choices;
[Builds](builds.md) explains planning, submitting and inspecting the resulting Build.

A Run is an optional saved Invocation. It names one Author entry, one or more Target Outputs, and
any choice that should apply only to this execution. It does not own project material or the
production graph.

```svrun
<?svml using="@hypit/markup/run@1"?>
<svrun version="1">
  <author source="./production.svml"/>
  <target output="final.video"/>
</svrun>
```

Targets are public Outputs from the selected Author Source. A final video is the ordinary delivery
Target. An image, prepared media value, transcript, alignment or another intermediate Output is also
a useful Target when the current work needs that result independently.

Runtime Profiles, Provider options, credentials, project files and output destinations remain in
their own owners. Saving another Run against the same Source creates another execution preset, not
another production.

## Keep project material in the Author Source

Media already chosen for the work is an ordinary project asset. Declare it with the package that
owns its meaning, then connect it to the generated role it realizes:

```svml
<import as="asset" from="@hypit/media@1"/>
<import as="realization" from="@hypit/realization@1"/>

<asset:Video id="accepted-opening" src="./assets/opening.mp4"/>
<realization:Select output={opening-generation.video} record={accepted-opening}/>
```

The selection is part of the authored production. A title, Caption, Timeline or rendering change
continues to use that video without restating it in every Run. To use another performance, change
the project asset or the authored selection and check the Source again.

Project files can come from a generation Result, a camera, a download or another tool. Once placed
in the project and declared, their origin does not alter composition. `hypit get` can export a public
Result Output to a chosen location; use the file format and Author declaration owned by the receiving
package afterward.

## Override a choice for one execution

A saved Run may temporarily ask for the AuthorGraph primary implementation:

```svrun
<override output="opening.video" primary="true"/>
```

This is useful for explicitly generating another take while the production continues to select the
accepted one. The new Build does not change the durable selection by itself. Inspect the Result,
place an accepted file in the project, and update the Author Source when the new take should become
the production's material.

A Run may also temporarily choose an existing authored Record:

```svrun
<override output="opening.video" record="alternate-opening"/>
```

The Record must already exist in the selected Author closure and have the exact Output Type. The
override is local to this Invocation. It cannot introduce a file, value or computation.

## Generate material while composing

Media requests depend on Script, direction, references and requested duration. Once those decisions
are ready and the commission covers their cost, target the material Output while component and Recipe
work continues:

```svrun
<?svml using="@hypit/markup/run@1"?>
<svrun version="1">
  <author source="./production.svml"/>
  <target output="opening.video"/>
</svrun>
```

Independent requests can run while downstream composition is authored. Read `hypit plan` before
submitting paid work. The resulting public Output remains in its Build Result for inspection and
export. Accepting it into the production means making it an ordinary project resource and editing
the Author Source; a later Run only chooses what to execute.

The small [production Source](examples/production.svml), [Recipe](examples/look.svs),
[material Run](examples/material.svrun), [production Run](examples/production.svrun), and focused
[detail Run](examples/detail.svrun) illustrate target-only presets over one authored production.

## Choose the useful Target

Target the narrowest Output that is independently useful now:

- target generated media when reviewing or accepting a new take;
- target transcript evidence when it should be inspected or edited before composition;
- target the final video for delivery;
- target named render parts when the delivery workflow intentionally assembles them later.

Target slicing does not change the work's authored relationships. A narrow render may still depend on
the media and timing used in that interval. `hypit plan` shows the actual selected dependencies and
external Needs.

Use [Rendering](rendering.md#choose-a-render-interval-in-frames) for frame-range delivery and
[Review](review.md) for judging the resulting arrangement. [Studio](studio.md) provides the interactive
view of the same Author Source when playback, parameter editing or a component Companion is useful.
