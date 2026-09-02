# Revising an existing project

A revision is an edit to the existing Source, Recipe or Run. It is not a new route object and it does
not require reconstruction history. The project directory supplied by the author is the baseline.

1. Read the request and inspect the current `.svml`, `.svs` and `.svrun` files.
2. Inspect `git diff` when the project is versioned so unrelated edits remain untouched.
3. Map the requested change to the smallest authoritative source fields.
4. Edit Source, Recipe or Run. Never edit a generated MP4, PNG, WAV or existing Result in place.
5. Run only the direct reports relevant to the change:

   ```bash
   hypit-reference-video-tools validate_local_author_packages --run <run>
   hypit-reference-video-tools validate_script_cues --run <run>
   hypit check <run>
   hypit-reference-video-tools preview_check <run> [<runtime>]
   hypit-reference-video-tools layout_check --run <run> [--runtime <runtime>]
   ```

   These reports do not form a sequence and do not approve the revision. Use them to find actual
   source, graph or layout problems.
6. If the change affects a reviewed visual declaration, render and review that declaration again.
   Do not invoke a visual observer when the visible design did not change.
7. If generation inputs changed and the author wants fresh generated media, run `hypit plan`, explain
   cost and obtain approval before a new Build. Otherwise reuse the existing Result inputs directly.
8. Show the updated Run in an existing Studio session, or start Studio and report its exact URL.

The completion record is the edited source plus any new Result the author approved. Do not write a
revision id, parent snapshot, progress cursor or duplicate history file.
