# @hypit/scene

`@hypit/scene` owns renderer-independent scene and local performance authoring
facts. A `hypit.scene@1` Project contains the base scene, objects selected from
packages, cameras, and zero or more exact-time performances.

## Base state, Performance and evaluation

Scene uses the same authoring/lowering boundary as NLE without treating a 3D
Performance as an edit Timeline:

```text
SceneProject (persistent direct author values)
  -> package Behavior resolution
  -> SceneProgram (transient executable projection)
  -> evaluateSceneProgramAt(t)
  -> complete Object and Camera states
```

An Object owns one base `SceneTransform`; a Camera owns one base `ScenePose`
and Lens. Both Pose types use position plus a quaternion. Target points, Euler
angles, path handles and orbit pivots are authoring projections or
package-owned behavior parameters, not a second persistent orientation.

A Performance owns one exact duration. Each Track selects exactly one Object or
Camera subject, and its non-overlapping Items place package-defined Behaviors
on that Performance clock. One subject may own several Tracks so the authoring
surface can keep distinct behavior lanes. A Shot independently selects the
active Camera over one non-overlapping interval. Camera motion and camera
selection are therefore different facts: a Camera may keep moving while no Shot
currently selects it, and several Shots may reuse the same Camera.

Item `start` and `duration` are Performance-local exact values. Behavior
parameters are Item-local. Moving an Item moves its internal behavior without
rewriting package parameters. The package resolver may compile semantic
parameters, paths or complete keyframes to the shared
`TemporalControl<Value, Interpolation>` algebra. The package owns its state
spelling and interpolation; Scene Core owns neither a central keyframe schema
nor an easing catalogue.

`lowerScenePerformance()` resolves every enabled Item through an explicitly
assembled `hypit.scene-package@1` Host. Missing and duplicate Behavior symbols
fail. The resulting `SceneProgram` is disposable execution state, never saved
to the Scene file and never used as Undo authority. `evaluateSceneProgramAt()`
starts from base states, evaluates the active Behavior for each subject, and
resolves only explicitly declared subject dependencies. Dependency cycles and
undeclared reads fail instead of being repaired.

The first composition rule is deliberately strict: one subject may have several
Tracks, but their enabled Items may not overlap in time. Each active Behavior
produces a complete standard state for its subject. A camera Behavior therefore
returns Pose and Lens together; an object Behavior returns its complete
Transform. Follow, aim and similar relations declare the other subject as a
dependency. Independent parallel modifiers such as handheld shake need an
explicit state-operator ABI; Core does not implicitly merge them by field name.

Static and Dynamic workbench modes edit this same Project. Static mode inspects
base state; Dynamic mode selects one Performance and an exact playhead. Neither
mode is a separate Scene format, and the base state is not defined as a
mandatory copy of a Performance's first frame.

## Package-owned authoring

Scene Core owns Transform, Pose, Lens, exact Performance placement and subject
references. It deliberately does not interpret `SceneEnvironment.parameters`,
`SceneObject.parameters`, or `ScenePerformanceItem.parameters`.

An installed package may contribute a `hypit.scene-authoring@1` Facet for one
exact Environment, Object, or Behavior symbol. Its `inspect` function projects
the package's own canonical value, and its `edit` function interprets an opaque
canonical operation. `SceneAuthoringHost` converts the returned value into an
ordinary revisioned `environment.replace`, `object.replace`, or
`performance-item.replace` transaction. Locks, validation, undo and persistence
therefore stay on the normal Scene path.

Authoring is optional and process-local. A Scene can still load, render, lower
and save when its package provides no editor contribution. The Host rejects
missing or duplicate authoring owners instead of inferring schemas from package
names or parameter keys.

Project-owned models, rigs, motions and environment resources live outside
`media/`, conventionally under `assets/scene/`. A Scene Object refers to one
explicit `hypit.scene-asset@1` document from its package-owned parameters; the
asset document in turn names its files relative to itself. Neither Scene nor
the Workbench discovers assets by scanning a directory.

```json
{
  "format": "hypit.scene-asset@1",
  "id": "standard-male",
  "name": "男性 · 标准",
  "using": {
    "module": { "name": "@project/scene-assets", "version": "1" },
    "name": "humanoid-character"
  },
  "resources": {
    "model": { "path": "model.gltf", "mediaType": "model/gltf+json" }
  },
  "parameters": { "rigProfile": "hypit-humanoid" }
}
```

The example asset library under `examples/assets/scene/` contains generated
low-poly mesh assets. Its `library.scene-library.json` declares the Workbench collection
tree, entry membership and search tags. Collection identities such as
`characters`, `furniture` or a project-specific grouping have no Core meaning;
the Workbench renders the hierarchy declared by the Library. A Scene selects
Libraries through exact `libraries[].path` references, never by scanning an
asset directory. The Library remains a presentation of assets, not an
authoritative registry or discovery index.

For the checked-in example set, `scripts/generate-example-scene-assets.mjs` is
the authoring source of truth. An Agent adds or changes one asset definition and
runs the generator; that single action writes the glTF, the corresponding
`hypit.scene-asset@1` document, and the Library entry together. The package test
then resolves every Library reference and every declared resource, and checks
that the people presets retain their declared anthropometric basis. This avoids
maintaining a model and its Library card as two unrelated edits.

Library Collections and search tags have separate jobs. A Collection controls
where a card is rendered; a tag only makes that card searchable. In the example
Library, `people` is the Collection whose visible label is `基础人物`, while
each generated character joins it through `collections: ["characters",
"people"]`. `characterAsset(...)` supplies that membership automatically, so
an Agent adding another base character does not repeat the UI label or remember
a separate category edit. Its `tags` remain ordinary search terms such as age,
sex, `人物`, and `person`.

Base characters are neutral structural mannequins, not wardrobe presets. Their
differences are stature, age, head-to-body ratio, shoulder/hip/waist structure,
limb proportions and build. They share one neutral material treatment; color is
not a Library category. Clothing that materially changes the silhouette belongs
to a new Agent-authored Scene Asset rather than another parameter on the base
mannequin.

```ts
import { createSceneProject, applySceneTransaction } from "@hypit/scene";

const project = createSceneProject({
  id: "shot",
  name: "Shot",
  environment: {
    using: { module: { name: "@project/environment", version: "1" }, name: "world" },
    parameters: {},
  },
});
const renamed = applySceneTransaction(project, {
  revision: 0,
  commands: [{ kind: "project.update", name: "Opening Shot" }],
});
```
