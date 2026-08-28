# `@hypit/reference-video-tools`

CLI tools for reconstructing a reference video with Hypit.

The package exposes reference-observation, vocabulary/gate, rendering, review, route-state,
revision-state and variant-expansion CLI subcommands, including `list_svml_packages`, `prepare_reference`,
`observe_reference`, `record_observation`, `inspect_svml_vocabulary`, and `compare_reconstruction`.
Each command prints one JSON result to stdout. The final source files are authored by the calling
agent and checked with the installed `hypit check` command.

Route and revision current views remain at `.hypit/route-state.json` and
`.hypit/revision-state.json` for compatibility. Every start also writes execution history under
`.hypit/routes/<route-id>/state.json` or `.hypit/revisions/<revision-id>/state.json`; revision requests
live beside their state as `request.json`. Machine check reports are immutable, content-addressed
files under `.hypit/evidence/<digest>/`, while same-named root files are only latest-result views.
Commands that persist a report return its immutable path as `evidence`; state checkpoints should use
that path rather than reconstructing a root filename.

For a completed project change, `revision_state --action start|read|checkpoint|reconcile` stores a
small atomic current snapshot plus revision-scoped history. Revision edits Source/Recipe/Run and reruns
deterministic gates; it does not invoke a VLM/observer or perform visual review. The project may be
handed in as an already completed directory: after its baseline gates pass, Revision can start
without a parent reconstruction or description route state.

For a validated source project that needs independent derivatives, `variant_state` stores the atomic
batch snapshot and base-project locator, `variant_init` copies the authored project without generated
results or secrets, and `variant_check` enforces the declared file scope plus the deterministic
package, Cue, graph, coverage and playback gates. Variant checking performs no render or visual
review. A paid Build remains a separate, explicitly approved action.

`--observer` on `prepare_reference` chooses who reads the reference, once per reference:

- `gemini` uploads the shot clips and the whole video to Vertex at a fixed temperature of `1.0`. It
  needs `GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS_JSON`, and it is the default.
- `agent` reaches no Provider. `prepare_reference` and `observe_reference` return each observation as
  a task carrying its prompt and the pictures to answer it from — one tile of evenly sampled frames
  per shot, the storyboard for the whole reference — and the calling agent answers them with
  `record_observation`.

Both observers produce the same observation keys in the same cache, so everything downstream reads one
shape. Neither receives SVML syntax, and neither writes SVML.

The canonical result envelope is `prepare_reference.observations` for the four whole-reference passes,
and `result: { status, text }` for a single or batch narrow answer. Direct whole-reference fields and
the `answer` alias are retained only for older callers.

Run the CLI from the repository or an installed package:

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools prepare_reference --video-path ./reference.mp4
hypit-reference-video-tools prepare_reference --video-path ./reference.mp4 --redo people
hypit-reference-video-tools prepare_reference --video-path ./reference.mp4 --redo transcript
hypit-reference-video-tools observe_reference --reference-id <reference-id>
hypit-reference-video-tools observe_reference --reference-id <reference-id> --shot-id shot-007
hypit-reference-video-tools observe_reference --reference-id <reference-id> --shot-id shot-007 --question "How thick is the outline on the caption words?"
hypit-reference-video-tools observe_reference --reference-id <reference-id> --shot-id shot-007 --reobserve
hypit-reference-video-tools inspect_svml_vocabulary --package @hypit/media-track --tag Track
hypit-reference-video-tools compare_reconstruction --reference-id <reference-id> --shot-id shot-007 --image ./rendered.png
hypit-reference-video-tools variant_state --action discover --project-root ./projects/base
hypit-reference-video-tools variant_state --action start --project-root ./projects/base --output-root ./projects/base-variants/<batch-id> --count 100
hypit-reference-video-tools variant_init --project-root ./projects/base --output-root ./projects/base-variants/<batch-id> --slate ./slate.json
hypit-reference-video-tools variant_check --run ./projects/base-variants/<batch-id>/001-example/build.svrun
```

For automation, every command also accepts `--input '{"...":"..."}'` with the complete JSON input
object. This is useful when the calling agent already has a structured request.

`list_svml_packages` reports every installed package that declares an activation, with the Surface
tags it registers. `inspect_svml_vocabulary` reads packages you can already name, and the Build CLI
is deliberately unable to scan a directory, so this is how a caller finds out what vocabulary exists
instead of working from memory.

`prepare_reference` requires a local video path and stores derived media under the checkout's
gitignored `.hypit/reference-video-tools/` directory, which is where every other command reads it
from whichever directory it is run in. It produces four full-reference observations: `people_and_product`,
`voices`, `persistent_systems` — the on-screen text and graphic systems that continue or recur across
the whole video, each one's lifetime, and whether its appearance ever changes — and `places`: how
many locations the video was shot in, which camera positions appear in each, which parts of the video
use each one, and each position described in enough detail to draw from the words alone. Without `--redo`, completed stages are reused. Use `--redo media` to rebuild shot media and
clear derived observations, `--redo transcript` to measure the words again, or `--redo people`, `--redo voices`, `--redo systems`, `--redo places`, or `--redo all` to
rerun only the selected full-reference stages.

It also produces `transcript`: the verbatim speech of the whole reference with a start and an end for
every single word. Placing an on-screen text reveal against the line that triggers it needs the time
of the word, not of the sentence around it, and that question comes up in every reconstruction. The
speech audio is extracted to `speech.wav` beside the shot media and measured by the local WhisperX
Provider in `@hypit/provider-whisperx-local`, which answers a loopback service on
`http://127.0.0.1:8765`; start the selected managed service with `hypit runtime up`.
The result reports `status`, `transcript_ref` and `word_count`, and the words themselves live in
`transcript.json` as passages, each with a `words` array of `{ text, start_seconds, end_seconds, score }`.
The transcript is deterministic local evidence rather than an observation: it is never written to the
observation cache and nothing about it is sent to Gemini. A machine with no WhisperX service running
reports `status: "unavailable"` with the reason and prepares everything else.

`observe_reference` observes every unfinished shot, or only the shots named by `--shot-id`. Each shot
produces three observations — `visual` (base picture, covering content, continuity, whether the frame
is a depicted scene or a flat designed field, and each framed element's inner picture separately from
its frame), `text_appearance` (typeface, weight, size, spacing, colour, stroke, shadow, glow,
per-word emphasis, position and entry of drawn text), and `audio`. The picture observation also
states whether the picture moves and how, separating camera movement from movement within it, since a
held still and a moving shot are reconstructed differently. Each cut adds one `continuity`
observation covering both whether the two shots are one continuous camera shot and whether an overlay
continues across the boundary. The preceding tail frame, audio tail and full-reference context are
attached automatically. Completed observations are reused; `--reobserve` is the only way to run a
completed one again.

Shots are never shorter than one second: a fragment below that is merged into the shot before it,
because clips that short carry no evidence and the model rejects them outright.

`HYPIT_REFERENCE_CONCURRENCY` and `HYPIT_REFERENCE_LAUNCH_GAP_MS` set how fast requests are issued,
defaulting to four at a time with a 1.5 second gap. They describe the quota behind the credentials
rather than anything about the video, so they are environment settings and not flags. Lower them if a
quota objects; the failure to expect is rate limiting, which backs off on its own before giving up.

`--question` is a separate narrow path: it requires exactly one `--shot-id`, answers only that
question from that shot's clip and frames in a single request, and neither reads nor writes the
observation cache. Cross-shot continuity uses the built-in boundary and three-shot window observations.

`compare_reconstruction` sends the named shot's reference frame and a rendered image as an
unlabelled pair and returns a description of their visible differences. It is never told which image
is which, what was built, or how. `--question` narrows it to one region of the picture and nothing
else. Results are not cached, because the rendered side changes on every iteration.

`unresolved` lists the keys of observations that failed. It is not a judgement about evidence
quality: a complete observation that says "unclear" is still complete.

Gemini uses the existing Vertex environment variables `GOOGLE_CLOUD_PROJECT` and
`GOOGLE_APPLICATION_CREDENTIALS_JSON`; the location defaults to `global` and the model defaults to
`gemini-3.1-pro-preview`.
