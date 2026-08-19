# Reference video reconstruction

Use this only when the task is to reproduce or reverse a complete reference video into usable
Hypit sources. The public interface is exactly three CLI subcommands in
`@hypit/reference-video-tools`:

- `hypit-reference-video-tools prepare_reference --video-path <path>` (or `--input <json>`) prepares the local video once, splits shots at or
  below 15 seconds, extracts every clip, representative frame, tail frame, and audio tail, and
  performs the one whole-reference people/product analysis and one whole-reference voice analysis.
- `hypit-reference-video-tools observe_reference --reference-id <id>` (or `--input <json>`) observes all selected shots in
  parallel. It automatically supplies the previous shot's tail frame and audio tail, the whole
  reference people/voice/product evidence, and all neighboring boundaries. It returns natural
  language picture, sound, camera-continuity, overlay-continuity, and any three-shot or follow-up
  evidence.
- `hypit-reference-video-tools inspect_svml_vocabulary --package <name>` (or `--input <json>`) reads the selected packages'
  current declarations and previews. It does not call Gemini and it does not know which component
  a visual observation should become.

The fixed loop is:

```text
run prepare_reference
→ run observe_reference for all shots
→ run observe_reference with one narrow follow-up for each unresolved conflict
→ run inspect_svml_vocabulary for the packages actually needed
→ main agent writes complete main.svml, studio.svs, build.svrun
→ pnpm hypit check
→ repair source syntax and run pnpm hypit check again
```

Never ask Gemini to write SVML, SVS, SVRun, a reference plan, component names, or package syntax.
Gemini's output is evidence in natural language; the main agent decides the final source structure.
Do not send vocabulary declarations or previews to Gemini.

The reconstruction must preserve these facts:

- Whoever is speaking is base. Visual layer order and screen area never decide base.
- Picture and sound ownership are independent. Full-screen B-roll, a media insert, or a ranking
  typewriter may cover the frame while the previous speaker's base and sound continue.
- A silent B-roll person who appears to speak cannot become the speaker or base.
- A continuing voice survives a shot with no visible person.
- One overlay that continues across a cut stays one visual track. Do not duplicate it in every shot.
- Combine two or three incorrectly split shots only when the natural-language continuity evidence
  confirms one shot and the combined duration is no more than 15 seconds.
- Reuse whole-reference people, voice, and product descriptions. A promoted product is described
  once and reused consistently.

After observations, read the selected package README as syntax authority as well as the dynamic
vocabulary returned by the `inspect_svml_vocabulary` CLI. Author one complete dependency graph, not separate
per-shot source fragments. Use only declared tags, attributes, children, ports, Recipe properties,
and admitted values. Use the existing `pnpm hypit check`; do not add or invent a check wrapper.
