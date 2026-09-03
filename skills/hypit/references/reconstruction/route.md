# Reference-video reconstruction

Use this workflow whenever a video file or link is the thing to reproduce, including an initial
presenter/product/brand adaptation requested together with the reference.

The reference is the sole design evidence for this route. Do not inspect Distribution example
projects, borrow another author project's files or packages, or wire the supplied reference itself
into a Film, Track, Take or final output. Every visible shot must be newly authored or explicitly
supplied by the author as replacement material.

## 1. Prepare and observe the reference

Read `../environment.md`, `../credentials.md` and `observers.md`. Ask once whether Gemini or the calling
agent should read the reference, then run:

```bash
hypit-reference-video-tools prepare_reference --video-path <path-or-link> --observer <gemini|agent>
hypit-reference-video-tools observe_reference --reference-id <reference-id>
```

For the agent observer, answer every returned task with `record_observation`. Prepared clips, frames,
storyboard, transcript and observations are the actual working material under
`.hypit/reference-video-tools/`; no route snapshot is created around them.

Read `evidence.md`, `continuity.md` and the relevant production craft. Separate:

- the base scene from covering overlays;
- an inset frame from the picture moving inside it;
- camera motion from motion inside the scene;
- persistent systems from one-off elements;
- spoken timing from visual shot boundaries.

## 2. Choose packages and author the faithful base

Inspect installed vocabulary instead of guessing:

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools inspect_svml_vocabulary --package <package>
hypit-reference-video-tools inspect_visual_schema
```

Read `vocabulary.md` and `final-sources.md`. Reuse public Surfaces when they fit. Use
`../local-author-package.md` only for a genuine missing capability. Never copy or edit an installed
package.

Write the faithful base before applying an initial requested presenter/product/brand substitution.
Short caption Cues use `||`, normally every 3–4 spoken words. Preserve shot coverage, overlay
continuity, picture-within-picture geometry and generated dependency ordering in Source/Recipe/Run.

## 3. Inspect the authored program

Run the direct reports that answer the current question:

```bash
hypit-reference-video-tools validate_local_author_packages --run ./build.svrun
hypit-reference-video-tools validate_script_cues --run ./build.svrun
hypit check ./build.svrun
hypit-reference-video-tools preview_check ./build.svrun
hypit-reference-video-tools layout_check --run ./build.svrun
```

These are independent reports. Layout output is advisory; repair a real issue or annotate intentional
geometry with `layout_accept` and a reason.

## 4. Compare actual visual elements

Read `comparison-round.md`. Render one named element over a Script window, then compare the render to
the corresponding reference stretch:

```bash
hypit-reference-video-tools render_element ./build.svrun \
  --element <id> --segment <segment> --reference-id <reference-id> \
  --out ./review/<element>.mp4
hypit-reference-video-tools compare_reconstruction \
  --reference-id <reference-id> --run ./build.svrun --segment <segment> \
  --video ./review/<element>.mp4 --element <id>
```

Use a still only when both sides are actually still. For an out-of-band agent observation, close the
returned comparison id with `record_observation`. Each explicit comparison is new; no file digest
silently replaces it with an older answer.

Use `reconstruction_check` as a summary of unreviewed elements, coverage and playback concerns. It is
not project state and does not prevent Build submission. Repair differences that matter to the
reference and the requested adaptation, then rerun only the affected inspection or comparison.

## 5. Build and deliver

Read `../runtime.md` and `../studio-confirmation.md`. Show the current Run in Studio and report its
exact URL. Before generation, run `hypit plan`, disclose cost and selected external services, obtain
approval, then run `hypit build` once.

The resulting project-owned Result is what that Build produced. Name important Results/outputs for
human retrieval. A later natural-language change follows `../revision/route.md` and edits Source,
Recipe or Run—not the generated video.

For many variants, copy the accepted project into independent directories and maintain an explicit
task list. Do not create variant state, aggregate completion records or hidden recovery history.
