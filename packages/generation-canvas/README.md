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
