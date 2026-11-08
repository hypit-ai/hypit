# `@hypit/generation-graph`

Persistent AIGC recipe graph and its lightweight Canvas layout.

The project file owns only author choices: nodes, typed package component references, inputs, Product
reference paths, the current selection and optional positions. Runtime state, Provider details, copied media,
progress and failures do not enter this document.

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
      },
      "products": [
        "./products/hero/take-001.json",
        "./products/hero/take-002.json"
      ],
      "selected": "./products/hero/take-002.json"
    }
  ],
  "layout": [
    { "node": "hero", "x": 640, "y": 120 }
  ]
}
```

Each Product entry is a tiny file that points to one exact Build output:

```json
{
  "format": "hypit.node-product@1",
  "build": "bld_20261108T090000000Z_7G5W2H9KQ3",
  "output": "hero"
}
```

`selected` has exactly `n + 1` choices for `n` Product paths: `"generate"`, or one listed path. It says
what this graph revision means; it does not report whether that Product is ready. A Host resolves the tiny
file through Result/Product storage. Missing, active and failed products remain unavailable and are never
silently replaced with generation.

`lowerGenerationGraph` is filesystem-free. Package code supplies each node's one-result `GraphFragment`,
and the Host supplies the already-resolved Product `TypedRecord` and owned Resource openers. Generated selections lower to ordinary
AuthorGraph Operations. Product selections lower to ordinary Record roots, so Core planning naturally stops
at that value without Candidate, Satisfaction, Pin or a second execution graph.

Generation behavior is contributed through `hypit.generation-node-package@1`. The same installed package may
contribute this authoring Facet, its deterministic Producer Facet and any other execution Facets it owns. The
project still names the logical Module component; the embedding application selects the exact installed
packages and passes their `LoadedPackage` values to `createNodeGenerationGraphProjectHost`. That Host builds the
Module closure, rejects missing or duplicate component owners, and derives `executionPackages` from the actual
physical package specifiers. There is no Generation Node registry, package scan or package installation hidden
inside the graph library.

`prepareGenerationGraphTargets` resolves only the target-reachable branch. An unrelated pending or failed
Product therefore cannot block another branch. A selection with no Steps returns `kind: "reuse"`; callers
must not submit it to Runtime or create another Result. A real Build returns its `BuildDefinition`, attachments
installed execution-package selection and `PublicationIntent`. Every demanded generated node is published under its node id, including intermediate
nodes, while reused Product inputs are not republished.

After Runtime accepts the stable Build id, `acceptGenerationGraphBuild` assigns one sidecar to every generated
node and produces a single project transaction that adds and selects those pending Products. The Node adapter
publishes sidecars first and the graph revision last. Completion, failure and cancellation change only the
Runtime/Result observation of the referenced Build; they do not rewrite the graph again.

`executeNodeGenerationGraphTargets` is the complete local authoring seam. It reads one revision, prepares the
finite selection, bypasses Runtime for exact reuse, submits real work, then attaches the accepted Build using
the sidecar-first transaction above. If Runtime accepted the Build but the author transaction loses a revision
race, `AcceptedGenerationGraphBuildNotAttached` reports that exact split: the work remains valid and is never
silently attached to a different revision.

The caller supplies the Build id. Generation Graph does not create execution identities or reproduce Runtime
preflight: an application uses the common long-running submission seam and may perform the graph attachment
as its domain-owned post-acceptance action. The lower-level structural Runtime port remains available to
embeddings, but it is not a second execution stack.

The revisioned transaction API edits the project atomically. Removing the currently selected Product first
requires a `node.select` command in the same transaction. Physical deletion of the tiny file is a Host action
after publication of the new project revision; Product bytes and immutable Result history are not deleted.
