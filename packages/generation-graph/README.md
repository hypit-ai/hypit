# `@hypit/generation-graph`

Persistent AIGC recipe DAG with optional Canvas positions.

The project owns reusable generation recipes, not attempts or generated media:

```json
{
  "format": "hypit.generation-graph@1",
  "id": "campaign-images",
  "name": "Campaign images",
  "revision": 3,
  "nodes": [
    {
      "id": "hero",
      "using": {
        "module": { "name": "@studio/image", "version": "1" },
        "name": "generate"
      },
      "inputs": {
        "prompt": { "value": "A glass city at dusk" },
        "reference": { "node": "moodboard" }
      }
    }
  ],
  "layout": [
    { "node": "hero", "x": 640, "y": 120 }
  ]
}
```

There is no node-local Product history, `selected` Product or `generate` state. Invoking the same Target twice
creates two independent Builds and two Product publications without changing the project revision. A Build is
an instantiation of the recipe, never an edit to it.

Generation behavior is contributed through `hypit.generation-node-package@1`. The same installed package may
contribute the authoring Facet, deterministic Producer Facets and execution Facets it owns. The project names a
logical Module component; the embedding application selects exact installed packages and passes their
`LoadedPackage` values to `createNodeGenerationGraphProjectHost`. Missing and duplicate owners fail exactly.
The library does not scan projects, install packages or maintain a second Generation registry.

An operation component describes what happens and its typed ports; it does not select who executes a Need.
Model-family packages such as `@hypit/whisperx` can contribute operation nodes, while independent Provider
packages satisfy their Capabilities through the Runtime profile. Adding another model, analyzer or Provider must
not add a node kind, result kind or vendor branch to Generation Graph Core.

`lowerGenerationGraph` is filesystem-free. Package code supplies each node's one-result `GraphFragment`.
Literal inputs become ordinary Records and node inputs become component-output references. Target preparation
visits only the reachable recipe branch and lowers it to the existing AuthorGraph and Kernel planner.

`prepareGenerationGraphTargets` produces one finite Build and a `PublicationIntent`. Every demanded node is
published under its node id, including intermediate nodes, so a completed upstream Product remains available
when a later operation fails. Product identity is the normal `{ publication: buildId, name: nodeId }`; it is
not copied into the recipe file.

`executeNodeGenerationGraphTargets` reads one project revision, prepares it and submits it without writing the
project. Concurrent submissions therefore do not race to attach a current Product. The caller supplies the
Build id through the common long-running submission boundary; Runtime preflight, Endpoint selection, recovery,
status and cancellation remain shared infrastructure.

The official application exposes that composition as:

```bash
hypit generation run images.graph.json --target hero
```

Each invocation submits fresh work. Machine output includes the Build id and exact Product addresses of all
published node outputs. Existing Products are reused only after an explicit domain materialization step, such
as turning a completed media Product into an ordinary Media Asset and connecting that authored media input.
The Generation Graph never searches Result history or follows a mutable "latest" value.

Current generated-media Fragments expose their selected primary image, video or audio as an ordinary Blob
output. The existing `hypit result export` plus `hypit media import` paths can therefore perform this handoff
without teaching Media Asset about Builds. A future desktop action may compose those two public seams and one
author transaction; it must not introduce a Product-backed Media node.

Canvas result cards are a projection of Build and Product observations. They may be displayed inside a
generation node, stacked, hidden or restored without becoming recipe fields. A finished result becomes an
author Graph node only through an explicit authoring transaction. External media and generated media then use
the same Media Asset representation; neither NLE nor downstream components consume Product sidecars.

Media is only one authored result kind. A WhisperX-style node may publish a `TimedTranscript`; its Type owner
exports an editable transcript file and may attach that file to a Media Asset as an explicit Representation.
Other analyzers may own masks, depth or tracking documents in the same way. Core and Canvas must not maintain a
switch over those result kinds: installed Type packages own codecs, optional inspectors and materializers.

The revisioned transaction API edits only author facts: project name, recipe nodes and Canvas positions.
Running, finishing, failing, cancelling or deleting a result card never increments the recipe revision.
