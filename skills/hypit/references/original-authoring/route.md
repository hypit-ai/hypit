# Original authoring

Use this workflow when the request supplies a description, topic, script or format but no reference
video.

## 1. Establish the project

Read `../environment.md`, create an independent author project, and keep `.svml`, `.svs`, `.svrun`
and `hypit.runtime.json` separate. Read `../brief-intake.md`, semantically relevant complete examples,
and `../playbooks/index.md` before deciding the visual system.

Write the brief as ordinary project content. It may be edited when the request becomes clearer; there
is no frozen brief snapshot or hidden progress record.

## 2. Choose vocabulary

Inspect what actually exists:

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools inspect_svml_vocabulary --package <package>
hypit-reference-video-tools inspect_visual_schema
```

Use public Surfaces and Recipe fields. When no installed package can express an important role, read
`../local-author-package.md` and create a project-local package. Do not alter installed packages.

## 3. Author Source, Recipe and Run

Write the smallest complete program. Every visible spoken passage uses short Cues separated by `||`,
normally 3–4 words. Apply the relevant craft references for coverage, captions, overlays, generated
dependencies, persona/audio and continuity.

Inspect the actual files directly:

```bash
hypit-reference-video-tools validate_local_author_packages --run ./build.svrun
hypit-reference-video-tools validate_script_cues --run ./build.svrun
hypit check ./build.svrun
hypit-reference-video-tools preview_check ./build.svrun
hypit-reference-video-tools layout_check --run ./build.svrun
```

These commands are separate reports. Run the ones that answer a real question, repair confirmed
issues, and record a reason with `layout_accept` when a measured offset/overlap/overflow is intentional.

## 4. Read the visual result

Use `authoring_check` to obtain a useful review plan, then render the named element/window locally:

```bash
hypit-reference-video-tools render_element ./build.svrun \
  --element <id> --tokens <from:to> --out ./review/<name>.mp4
hypit-reference-video-tools review_element --run ./build.svrun \
  --element <id> --tokens <from:to> --video ./review/<name>.mp4 \
  --intent-file ./review/<intent>.md
```

Record out-of-band findings with `record_review`. Fix what conflicts with the brief; do not chase a
numeric score or repeat the same view merely to obtain a different answer.

## 5. Build or hand off

Read `../runtime.md` and `../studio-confirmation.md`. Use Studio to show the current Run and report its
exact URL. When the user wants generated media, run `hypit plan`, disclose cost and external Provider
selection, obtain approval, then run `hypit build` once.

The Result from that Build is the durable answer. Give important Results/outputs human presentation
names. A later request edits the existing Source through `../revision/route.md`; it never edits the
rendered media.

For many variants, copy the accepted source project into ordinary independent directories and keep a
human-readable task list. Do not create an aggregate variant state system, and do not submit paid
Builds unless the author requested them.
