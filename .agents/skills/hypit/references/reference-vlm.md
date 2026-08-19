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
→ if vocabulary is insufficient, develop and install one complete project-local package
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

## When the vocabulary has a real gap

First try to express the observation by composing existing packages. A tag that looks similar is
not sufficient: its declared inputs, outputs, timing behavior and visual result must actually cover
the observation. Never write a nonexistent tag and plan to implement it later.

If no existing legal composition can express the result, stop authoring the three source files and
develop a project-local author package. This is main-agent software development; it is not a fourth
reference-video command and it is not work for Gemini.

Read all of the following before editing:

- `docs/guide/author-packages.md`
- `docs/guide/packages.md`
- `docs/guide/conventions.md`
- `packages/component-kit/README.md`
- The closest existing package's README, `manifest.ts`, `surface.ts`, `component.ts`, and
  `activation.ts`

Create only a new `packages/local-<slug>/` package named `@hypit/local-<slug>`. Do not change an
existing Hypit package. The new package must have a complete Module Manifest, Types, Producers and
Validators as required, Markup Surface declaration and decoder, activation descriptor, README,
visual preview when applicable, and the implementation that produces its declared result. A Surface
or vocabulary declaration without executable implementation is not a component.

Connect the package to the current project's existing pnpm workspace and package root through an
ordinary `workspace:*` dependency and `pnpm install`. Do not hide it under `.hypit/`, modify the
package loader, or add a private registry. Then run:

```bash
pnpm check
pnpm hypit check main.svml
pnpm hypit check studio.svs
pnpm hypit check build.svrun
```

Use the appropriate source paths and existing `--workspace` or `--package-root` options when the
project layout needs them. Fix resolution, activation and package implementation errors before
repairing source usage. Only continue the reconstruction when all existing checks accept the new
package and final sources.

Gemini must not write the local package or see its TypeScript and package syntax. The observed video
is evidence for the behavior; the main agent owns all package architecture and code. If the user
later approves the result, offer to promote the project-local package into the official Hypit
repository as a separate contribution, but never move it automatically.
