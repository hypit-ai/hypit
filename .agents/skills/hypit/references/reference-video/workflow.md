# Reference-video workflow

The public interface is exactly three CLI subcommands from `@hypit/reference-video-tools`:

```bash
hypit-reference-video-tools prepare_reference --video-path <path>
hypit-reference-video-tools observe_reference --reference-id <reference-id>
hypit-reference-video-tools inspect_svml_vocabulary --package <package> --tag <tag>
```

Defaults are sufficient for normal use. When a completed preparation stage needs to be rerun, use
one of the small `--redo` values:

```bash
hypit-reference-video-tools prepare_reference --video-path <path> --redo people
```

Use `--redo media` to rebuild shot media and clear derived observations, `--redo voices` for the
whole-reference voice pass, or `--redo all` for every preparation stage. For observation, omit shot
IDs to process all unfinished work. Supplying `--shot-id` one or more times forces those shots and
their adjacent continuity boundaries to run again; three continuous IDs also trigger the three-shot
continuity review. Add one `--question` for a narrow follow-up. The tool always attaches the
preceding tail frame, audio tail and full-reference people/voice/product evidence automatically.

Each also accepts `--input <json>`. Follow this sequence:

```text
prepare_reference
→ observe_reference for all shots
→ narrow observe_reference follow-ups for unresolved conflicts
→ inspect_svml_vocabulary for candidate packages
→ develop a project-local package only for a proven vocabulary gap
→ author complete main.svml, studio.svs, build.svrun
→ use existing checks and repair until legal
```

`prepare_reference` deterministically prepares clips, representative frames, tail frames, audio
tails and storyboard context, then obtains whole-reference people/product and voice observations.
`observe_reference` automatically attaches the preceding tail frame/audio tail and whole-reference
context. The main agent does not manually reconstruct this context.

Gemini returns natural language only. Never send it SVML syntax, package declarations, vocabulary,
previews or implementation code. Never ask it to write SVML, SVS, SVRun, a structured reference
plan, component names or TypeScript. It is evidence, not the final decision maker.

Inspect every failed or unresolved result. Follow up with one narrow question over one to three
relevant shots rather than repeating the entire analysis. Preserve successful cached observations
unless the selected shot or preparation stage must be refreshed. Do not pass model, concurrency,
rate-limit or temperature settings; temperature is fixed at `1.0`.
