# `@hypit/generation-canvas`

Interactive Generation Workspace for one Generation Graph.

The referenced `hypit.generation-graph@1` file owns reusable recipe nodes, authored inputs and
execution dependencies. A `hypit.generation-workspace@1` file owns the interaction facts that must
survive reopening the Canvas: editable occurrence names, node placement, optional explicit node size, viewport, exact Build
outputs attached to each operation node, and the author's explicit selected output. Runtime state
and Product values remain observations.

```json
{
  "format": "hypit.generation-workspace@1",
  "id": "campaign-main",
  "name": "Campaign",
  "revision": 4,
  "graph": { "path": "campaign.graph.json" },
  "viewport": { "centerX": 640, "centerY": 360, "zoom": 0.82 },
  "nodes": [
    {
      "node": "hero",
      "name": "Opening portrait",
      "x": 120,
      "y": 80,
      "selected": { "build": "Build-A", "output": "hero" }
    }
  ],
  "outputs": [
    { "node": "hero", "build": "Build-A", "output": "hero" }
  ]
}
```

Node `width` and `height` are written together only after the author explicitly resizes a node. When
they are absent, an ungenerated operation is a square regardless of its output role. Once a Product
or Media Asset is displayed, Canvas derives the media frame from that resource; audio Products use a
compact player. Clearing the explicit size restores that derived behavior. These are Workspace
presentation facts and never enter Graph lowering or Build requests.

An attached output is an exact observation address, not a copied Product or Media Asset. It may be
attached as soon as Runtime durably accepts the Build. The Host observes active state through Runtime
and finished state through Result/Product history. Pending, ready, failed, preview and Provider data
are never copied into the Workspace.

`selected` is different: it is an author choice, so it belongs in the Workspace. It says which exact
Product an operation node supplies when another node is generated interactively. It does not change
the recipe, mark the node complete, or select a global latest result.

Canvas generation resolves a reached upstream operation to its selected Product when it has one.
An unselected upstream operation continues through the saved recipe and is generated in the same
Build. The target itself is always generated, while authored value nodes still load their stable
value (for example, a Media Asset) normally.

Attached output history never implies selection. A node may retain any number of exact outputs while
having no `selected` output; in that state downstream interactive generation executes the node. Selecting
one exact output makes it the reuse boundary for downstream nodes, and clearing that selection restores
recipe execution without deleting history.

The selected Product is supplied to Graph lowering as an invocation-local typed value plus resource
attachments. Generation Graph Core therefore does not know Product storage and the recipe file does
not acquire result history. Host-side type validation and resource opening remain authoritative even
if a browser submits the action.

Adopting an output is a separate authoring action. Its Type owner materializes the Product into an
ordinary author value such as a Media Asset, then an ordinary Graph transaction adds that value node.
The original operation result remains attached as history; adoption does not mutate it into an asset.

`projectGenerationCanvas()` joins Graph recipe, Workspace author choices and transient observations.
Recipe edges are derived from the Graph. The Node Host follows the Workspace's portable Graph path and
persists each Workspace transaction atomically; Graph and Workspace retain independent revisions.

The package also owns the `hypit.generation-workspace@1` Project Object projection. Discovery finds
freely placed `*.workspace.json` documents; observing one exposes its explicit Graph reference as a
`hypit.generation-graph@1` Project Object. This projection neither opens a Canvas nor stores a central
project index.

Packages may additionally contribute a `hypit.generation-canvas-presentation` Facet for their exact
Generation Node symbols. Each entry supplies a node-type `displayName`, one finite semantic role
(`text`, `image`, `video`, `audio`, `transcript`, `asset` or `generic`) and, when useful, the exact
authored `summaryInput`. Field labels and layout hints may name ids from the node owner's
`GenerationNodeAuthoringShape`, but the presentation never redeclares schemas, cardinality, media roles or Graph
input encoding. Canvas joins both package-owned contributions, owns all markup, icons, colors and layout, and
parses only the finite authoring vocabulary. Missing presentation contributions fall back to `generic`; Canvas
never guesses meaning from package or component names.
