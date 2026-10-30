# Targets for one execution

Read this when choosing which Author Outputs one plan, Build or Studio session must reach.
[Authoring](authoring.md) explains the production Source and durable material choices;
[Builds](builds.md) explains planning, submitting and inspecting the resulting Build.

A Target is an author-facing Output name supplied to the current command. It selects the finite
slice of the fixed Author graph evaluated by that command. Source paths and Targets are transient
command or Studio-session inputs; durable material choices remain explicit references in Author Source.

```bash
hypit plan production.svml --target final.video
hypit build production.svml --target final.video --follow
hypit studio --source production.svml --target final.video
```

Repeat `--target` when the current action genuinely needs several independently useful Outputs:

```bash
hypit plan production.svml \
  --target opening.video \
  --target closing.video
```

A project can place a frequently repeated command in its ordinary task runner or `package.json`
scripts. Hypit receives the Source path and Targets from that command.

## Keep project material in the Author Source

Media already chosen for the work is an ordinary project asset. Declare it with the package that
owns its meaning, then make the consuming declaration reference it directly:

```svml
<import as="asset" from="@hypit/media@1"/>
<import as="mediaop" from="@hypit/media-operations@1"/>

<asset:Video id="accepted-opening" src="./assets/opening.mp4"/>
<mediaop:Prepare id="opening-media" source={accepted-opening}
  video="primary-moving" audio="default" span-authority="video"/>
```

The reference is part of the authored production. A title, Caption, Timeline or rendering change
continues to use that video without restating it at execution time. To use another performance,
change the consumer reference and check the Source again.

Project files can come from a generation Result, a camera, a download or another tool. Once placed
in the project and declared, their origin does not alter composition. `hypit result export` can export
a retained Result Output to a chosen location; use the file format and Source declaration owned by
the receiving package afterward.

## Generate material while composing

Media requests depend on Script, direction, references and requested duration. Once those decisions
are ready and the commission covers their cost, target the material Output while component and Recipe
work continues:

```bash
hypit plan production.svml --target opening.video
hypit build production.svml --target opening.video --follow
```

Independent requests can run while downstream composition is authored. Read `hypit plan` before
submitting paid work. The generated artifact remains in its Build Result when its package declares
cross-Build retention. Accepting it into the production means exporting it as an ordinary project
resource and editing the Author Source; a later command only chooses what to evaluate.

## Choose the useful Target

Target the narrowest Output that is independently useful now:

- target generated media when reviewing or accepting a new take;
- target transcript evidence when it should be inspected or edited before composition;
- target the final video for delivery;
- target named render parts when the delivery workflow intentionally assembles them later.

Target slicing does not change the work's authored relationships. A narrow render may still depend
on the media and timing used in that interval. `hypit plan` shows the selected dependencies and
external Needs. Package declarations determine which reachable Outputs acquire Result lifetime.

Use [Rendering](rendering.md#choose-a-render-interval-in-frames) for frame-range delivery and
[Review](review.md) for judging the resulting arrangement. [Studio](studio.md) provides an interactive
view of the same Author Source and explicit Targets when playback, parameter editing or a component
Companion is useful.
