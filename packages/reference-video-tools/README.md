# `@hypit/reference-video-tools`

CLI tools for reconstructing a reference video with Hypit.

The package exposes four CLI subcommands: `prepare_reference`, `observe_reference`,
`inspect_svml_vocabulary`, and `compare_reconstruction`. Each command prints one JSON result to
stdout. Every command except `inspect_svml_vocabulary` sends narrow natural-language requests to
Gemini with a fixed temperature of `1.0`; they never receive SVML syntax and never write SVML. The
final source files are authored by the calling agent and checked with the existing
`pnpm hypit check` command.

Run the CLI from the repository or an installed package:

```bash
pnpm hypit-reference-video-tools prepare_reference --video-path ./reference.mp4
pnpm hypit-reference-video-tools prepare_reference --video-path ./reference.mp4 --redo people
pnpm hypit-reference-video-tools observe_reference --reference-id <reference-id>
pnpm hypit-reference-video-tools observe_reference --reference-id <reference-id> --shot-id shot-007
pnpm hypit-reference-video-tools observe_reference --reference-id <reference-id> --shot-id shot-007 --question "How thick is the outline on the caption words?"
pnpm hypit-reference-video-tools observe_reference --reference-id <reference-id> --shot-id shot-007 --reobserve
pnpm hypit-reference-video-tools inspect_svml_vocabulary --package @hypit/media-track --tag Track
pnpm hypit-reference-video-tools compare_reconstruction --reference-id <reference-id> --shot-id shot-007 --image ./rendered.png
```

For automation, every command also accepts `--input '{"...":"..."}'` with the complete JSON input
object. This is useful when the calling agent already has a structured request.

`prepare_reference` requires a local video path and stores derived media under the project's
gitignored `.hypit/reference-video-tools/` directory. It produces three full-reference observations:
`people_and_product`, `voices`, and `persistent_systems` — the on-screen text and graphic systems
that continue or recur across the whole video, each one's lifetime, and whether its appearance ever
changes. Without `--redo`, completed stages are reused. Use `--redo media` to rebuild shot media and
clear derived observations, or `--redo people`, `--redo voices`, `--redo systems`, or `--redo all` to
rerun only the selected full-reference stages.

`observe_reference` observes every unfinished shot, or only the shots named by `--shot-id`. Each shot
produces three observations — `visual` (base picture, covering content, continuity, whether the frame
is a depicted scene or a flat designed field, and each framed element's inner picture separately from
its frame), `text_appearance` (typeface, weight, size, spacing, colour, stroke, shadow, glow,
per-word emphasis, position and entry of drawn text), and `audio` — plus per-boundary continuity
observations. The preceding tail frame, audio tail and full-reference context are attached
automatically. Completed observations are reused; `--reobserve` is the only way to run a completed
one again.

`--question` is a separate narrow path: it requires one to three `--shot-id` values, answers only
that question from those shots' clips and frames in a single request, and neither reads nor writes
the observation cache.

`compare_reconstruction` sends the named shot's reference frame and a rendered image as an
unlabelled pair and returns a description of their visible differences. It is never told which image
is which, what was built, or how. `--question` narrows it to one region of the picture and nothing
else. Results are not cached, because the rendered side changes on every iteration.

`unresolved` lists the keys of observations that failed. It is not a judgement about evidence
quality: a complete observation that says "unclear" is still complete.

Gemini uses the existing Vertex environment variables `GOOGLE_CLOUD_PROJECT` and
`GOOGLE_APPLICATION_CREDENTIALS_JSON`; the location defaults to `global` and the model defaults to
`gemini-3.1-pro-preview`.
