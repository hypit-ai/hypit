# `@hypit/generation-canvas`

Persistent spatial projection for one Generation Graph.

The referenced `hypit.generation-graph@1` file owns reusable recipe nodes, authored inputs and execution
dependencies. A `hypit.generation-canvas@1` View owns only which Graph nodes and exact Build outputs are visible
and where they are placed. Moving or removing a Canvas Item never changes the recipe, Build or Product.

```json
{
  "format": "hypit.generation-canvas@1",
  "id": "campaign-main",
  "name": "Campaign",
  "revision": 4,
  "graph": { "path": "campaign.graph.json" },
  "items": [
    {
      "id": "node-hero",
      "subject": { "kind": "graph-node", "node": "hero" },
      "x": 120,
      "y": 80
    },
    {
      "id": "result-build-a-hero",
      "subject": { "kind": "build-output", "build": "Build-A", "output": "hero" },
      "x": 120,
      "y": 340
    }
  ]
}
```

A `build-output` is an exact observation address, not a copied Product and not a Media node. It may be added as
soon as Runtime durably accepts the Build. The Host resolves its current active state through Runtime and its
finished value through Product/Result history. No status, preview, Provider, media type or failure text is copied
into the View. Refresh therefore restores the card without making the Generation Graph own execution history.

Selection, hover, viewport, zoom and an in-progress drag remain Session state. Product preview stays Type-owned.
Removing a Build-output Item removes only its Canvas projection; History can place the same exact output again.
Turning a completed output into reusable authored input remains an explicit Type-owned materialization followed by
an ordinary Generation Graph transaction.

`planGenerationCanvasBuildOutputAdoption()` coordinates that authoring gesture without interpreting the Product:
the installed Product Type owner first materializes its ordinary author file and returns a dependency-free value
node; the plan then adds that node, applies any explicit downstream rewiring, and replaces the Build-output Item
with the Graph-node subject at the same Canvas position. The Product remains in Result history, so adoption copies
no execution state and does not make the authored node depend on a past Build.

`planAcceptedGenerationCanvasBuild()` turns a durably accepted Build receipt plus Host-owned placements into one
Canvas transaction. It requires a placement for every published operation output and copies no execution state.
`observeGenerationCanvasBuildOutputs()` inspects each referenced active Build once, then falls back to finished
Result history when Runtime no longer owns it. `projectGenerationCanvas()` joins those observations with the Graph
and View, deriving recipe and `produced-by` edges without persisting either edge in the View.

The Node Host closes the first headless workflow. `placeAcceptedBuildInGenerationCanvas()` checks the caller's
View revision and atomically saves all cards for one accepted receipt. `openNodeGenerationCanvas()` follows the
View's portable Graph path, observes every referenced Build and returns the complete projected Scene. A receipt
write failure does not cancel or relabel the already accepted Build; its Result remains recoverable from History.

`adoptBuildOutputInGenerationCanvas()` supplies the Node filesystem coordination around the pure adoption plan.
Its materializer is injected by the caller and remains Type-owned. The Host validates both current revisions and
both next documents before saving the Graph first and the Canvas second. Ordinary files cannot provide one atomic
transaction across those two paths: if the second save fails, the new author node deliberately remains in the
Graph and the error identifies the Canvas Item that was not replaced. Retrying or removing that visible node is
therefore possible without a hidden recovery table.
