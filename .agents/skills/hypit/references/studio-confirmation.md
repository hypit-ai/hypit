# Studio handoff and paid Build

Studio display and paid execution are separate decisions.

## Before a paid Build

1. Read the selected Runtime Profile and preflight. Tell the author which Provider, Endpoint and
   credential source will serve each paid capability without revealing secrets.
2. Produce a local preview through `render_element` or `realizePreviewMock` and use the exact
   `previewRun` path it returns.
3. Start Studio with that Run and report the exact URL printed by the server.
4. Explain that the preview uses local stand-in media and estimate timing.
5. Run `hypit plan`, state the estimated cost, and wait for explicit approval before `hypit build`.

If the author requests a change, edit Source/Recipe/Run through `revision/route.md`. Studio display is
not permission to spend money.

## After a Build

Inspect the project-owned Result. It identifies the Build and its public outputs, including useful
intermediate component ports. Give important Results and outputs human presentation names.

To view or reuse accepted upstream material, write a separate Run with explicit `build-record` and
`satisfy` declarations. Do not satisfy the final target when Studio needs to trace the current Film
graph; keep the target unresolved and pin only the upstream generated values the preview needs.

Start Studio for that accepted-material Run and report the URL. Rendering and Studio viewing may run
at the same time; neither waits for the other.

## After an edit

Reuse a running Studio process for the same Run and startup parameters so its watcher can reload
Source. If the Run, workspace or port changes, stop the old process before starting another. A visual
edit may be reviewed when useful, but the revision has no hidden completion state and does not require
a new paid Build unless the author asks for regenerated material.

In a contributor checkout, `hypit-studio` means
`node <checkout>/bin/hypit-studio.mjs`; it is a standalone entrypoint, not `hypit studio`.
