# Canvas Recipes, Invocations, and Adoption

Canvas (`*.canvas.json`) owns AIGC recipes, typed input connections between nodes, attached
Execution Invocations, and explicit Publication selections.

## CLI workflow

```bash
# 1. Create a board (or use existing main.canvas.json)
hypit canvas create generation/opening.canvas.json --name "Opening"

# 2. Discover installed models, fields, outputs, and connected environments
hypit canvas catalog generation/opening.canvas.json --json

# 3. Inspect the board (get current revision and nodes)
hypit canvas inspect generation/opening.canvas.json --json

# 4. Edit nodes and connections atomically with revision check
hypit canvas apply generation/opening.canvas.json --input edit.json

# 5. Inspect one node's fields, issues, outputs, and selected results
hypit canvas node generation/opening.canvas.json motion --json

# 6. Quote cost before invoking
hypit canvas quote generation/opening.canvas.json motion --json

# 7. Invoke generation (requires --if-revision from inspect/apply/quote)
hypit canvas invoke generation/opening.canvas.json motion --if-revision "<revision>" --json

# 8. Wait for completion
hypit execution wait <invocation> [--environment <env>]

# 9. Inspect node history to find completed Publication addresses and outputs
hypit canvas history generation/opening.canvas.json motion --json

# 10. Adopt a Publication resource into Project Media (*.media.json)
hypit canvas adopt generation/opening.canvas.json motion --input adopt.json --json

# Open visually in Canvas Studio
hypit canvas open generation/opening.canvas.json
```

Pass `--project <dir>` if running outside the project root. Omit `--environment` when only one
Execution Environment is connected.

## `canvas apply` transaction commands

`hypit canvas apply <file.canvas.json> --input <file|->` accepts `{ expectedRevision, commands }`:

| Command `kind` | Purpose |
| --- | --- |
| `node.add`, `node.remove` | Add or remove a recipe/media card by node ID |
| `node.rename`, `node.move`, `node.resize` | Rename, move (`x`, `y`), or resize a card |
| `node.set-media` | Replace the Project Media referenced by a media card |
| `node.set-recipe` | Change a node's `capability` / recipe while preserving position & history |
| `input.set`, `input.clear` | Bind an input to a literal `{ "value": ... }`, media reference, or upstream output `{ "from": { "node": "...", "output": "..." } }` |
| `result.attach`, `result.detach`, `result.select`, `result.clear` | Attach/detach Invocation addresses or select a specific Publication output/resource for downstream inputs |

Example `edit.json`:

```json
{
  "expectedRevision": "<revision-from-inspect>",
  "commands": [
    { "kind": "node.move", "node": "motion", "x": 460, "y": 100 },
    {
      "kind": "input.set",
      "node": "motion",
      "input": "firstFrame",
      "binding": {
        "from": { "node": "still", "output": "image" },
        "personReference": false
      }
    }
  ]
}
```

## Adopting Publications into Project Media

`hypit canvas adopt <file.canvas.json> <node> --input adopt.json` copies the selected Publication
resource into Project Media and returns a portable `.media.json` reference ready for SVML:

```json
{
  "selection": {
    "address": {
      "environment": "hypihub",
      "invocation": "<invocation-id>"
    },
    "output": "video",
    "resource": "primary"
  },
  "target": {
    "kind": "media",
    "path": "media/opening.media.json"
  }
}
```

## Recoverable submission and reuse

- `canvas invoke` persists the Invocation address onto the node **before** starting execution.
- Pass `--invocation-id <uuid>` when you need idempotent retry semantics.
- Completed Publications remain in node history; use `result.select` to feed an existing output
  into downstream nodes without paying to regenerate it.
