# Reference-video workflow

The public interface is exactly five CLI subcommands from `@hypit/reference-video-tools`:

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools prepare_reference --video-path <path>
hypit-reference-video-tools observe_reference --reference-id <reference-id>
hypit-reference-video-tools inspect_svml_vocabulary --package <package> --tag <tag>
hypit-reference-video-tools compare_reconstruction --reference-id <reference-id> --shot-id <shot-id> --image <path>
```

Defaults are sufficient for normal use. Each also accepts `--input <json>`. Follow this sequence:

```text
list_svml_packages
→ prepare_reference
→ observe_reference for all shots
→ narrow observe_reference questions for unresolved appearance and conflicts
→ inspect_svml_vocabulary for candidate packages
→ develop a project-local package only for a proven vocabulary gap
→ read final-sources.md, then author complete main.svml, studio.svs, build.svrun
→ use existing checks and repair until legal
→ read reconstruction-loop.md, then render each authored element and compare it
```

## list_svml_packages

Reports every installed package that declares an activation, with the Surface tags it registers.
This is the only way to know what vocabulary exists: `inspect_svml_vocabulary` reads packages you
name, and the Build CLI is deliberately unable to scan a directory. Run it before deciding anything
is missing.

## prepare_reference

`prepare_reference` deterministically prepares clips, representative frames, tail frames, audio tails
and storyboard context, then obtains four whole-reference observations. `people_and_product` and `voices` cover who recurs.
`persistent_systems` covers the on-screen text and graphic systems that continue or recur across the
whole video, each one's lifetime, and whether its appearance ever changes. `places` covers how many
locations the video was shot in, which camera positions appear in each, which parts of the video use
each one, and each position described in enough detail to draw from the words alone — which is what
reconstructing a location depends on, since reference frames are never fed to generation.

When a completed preparation stage must be rerun, use one small `--redo` value:

```bash
hypit-reference-video-tools prepare_reference --video-path <path> --redo people
```

`--redo media` rebuilds shot media and clears every derived observation. `--redo people`,
`--redo voices`, `--redo systems` and `--redo places` rerun one whole-reference stage. `--redo all` reruns everything.

## observe_reference

Omit shot IDs to process all unfinished work; supply `--shot-id` one or more times to work on
selected shots. Each shot produces three observations:

- `visual` — the base picture, covering and non-covering content, continuity from the preceding shot,
  whether the frame is a depicted scene or a flat designed field, and each framed element's inner
  picture described separately from its frame;
- `text_appearance` — the typeface character, weight, size, spacing, alignment, colour, stroke,
  shadow, glow, per-word emphasis, position and entry of text drawn over the picture;
- `audio` — who is speaking, and what continues from the previous shot.

The picture observation also says whether the picture moves and how, separating camera movement from
movement inside the frame. A held still and a moving shot are reconstructed differently.

Each cut produces one `continuity` observation answering both questions under their own headings —
whether the two shots are one continuous camera shot, and whether an overlay continues across the
boundary — and a window of three consecutive shots triggers a three-shot continuity review. The
preceding tail frame, audio tail and full-reference evidence are attached automatically; do not
reconstruct that context by hand.

A shot is never shorter than a second. Fragments below that are not shots, and clips that short are
rejected by the model, so the detector merges them into the shot before them.

Completed observations are reused. Naming a shot does not re-run it. `--reobserve` is the only way to
run a completed observation again, and it exists for rebuilt media, not for doubt.

`unresolved` lists the keys of observations that failed outright. It is not a judgement about
evidence quality: a complete observation that says "unclear" is still complete, and that is what a
narrow question is for.

## Narrow questions

`--question` is a separate path. It requires one to three `--shot-id` values, answers only that
question from those shots' clips and frames in a single request, and neither reads nor writes the
observation cache:

```bash
hypit-reference-video-tools observe_reference --reference-id <id> --shot-id shot-007 \
  --question "How thick is the outline on the caption words, relative to the stroke width of the letters?"
```

Ask about visible attributes. Never ask which component to use.

## compare_reconstruction

`compare_reconstruction` sends the shot's reference frame and a rendered image as an unlabelled pair
and returns a description of their visible differences. It is never told which image is which, what
was built, or how; `--question` may narrow it to one region of the picture and nothing else. Results
are not cached. `reconstruction-loop.md` governs when and how to use it.

## Boundaries

Gemini returns natural language only. Never send it SVML syntax, package declarations, vocabulary,
previews or implementation code. Never ask it to write SVML, SVS, SVRun, a structured reference plan,
component names or TypeScript. Never tell it what you built or what you expect it to find. It is
evidence, not the final decision maker.

Inspect every failed or unresolved result. Follow up with one narrow question over one to three
relevant shots rather than repeating the entire analysis. Preserve successful cached observations
unless the selected shot or preparation stage must be refreshed. Do not pass model, concurrency,
rate-limit or temperature settings; temperature is fixed at `1.0`.
