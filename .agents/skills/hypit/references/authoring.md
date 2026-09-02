# Hypit source authoring

Read `quickstart.md` and the authoritative page it selects. Keep Author Source, Recipe Source and Run
Source complete rather than assembling independent per-shot fragments.

Before writing an element, inspect the owning package's public vocabulary and README. Never invent a
component, attribute, child, port, Recipe property or literal value, and never infer one package's
syntax from another.

Use direct reports as needed:

```bash
hypit-reference-video-tools validate_local_author_packages --run <run>
hypit-reference-video-tools validate_script_cues --run <run>
hypit check <run>
hypit-reference-video-tools preview_check <run> [<runtime>]
```

`hypit check` answers whether Source is legal. `preview_check` answers whether the Run traces to a
Film or whether only external capabilities remain unresolved. Neither records project progress.

An admitted model-neutral value is not proof that every Provider Endpoint accepts it. Before a paid
Build, read the selected Provider documentation and Runtime preflight. Resolve endpoint limitations
before submission.

## Reuse an accepted Result output

Reference a public output accepted by an earlier Build in a later Run:

```svml
<target output="final.video"/>
<build-record id="accepted-take" build="build-001" output="opening-take.video"/>
<satisfy output="opening-take.video" candidate="accepted-take"/>
```

The Candidate must have the exact nominal Type required by the Logical Output. Changing Targets alone
does not select a Result. When Studio or inspection needs a `build-record`, pass the Runtime Profile so
the Result repository can be opened.

Reuse generated media and paid SemanticTakes when their generating inputs still mean the same thing.
If a Script Segment changes, do not keep a SemanticTake whose tokens and anchors describe the old
Segment. Deterministic Track projections are recomputed from current Source; they are not historical
media to pin.

A failed Build may still have useful public outputs in its Result. Inspect and name those outputs, then
reference exactly the ones needed by the next Run. Do not resubmit the Build merely to recreate them.

For whole-video design decisions read `playbooks/index.md`. A later user-requested change follows
`revision/route.md` and edits Source/Recipe/Run, never generated media.
