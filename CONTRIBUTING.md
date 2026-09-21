# Contributing to Hypit

[简体中文](./CONTRIBUTING.zh-CN.md)

Pull requests are welcome. Documentation, examples and translations count as much as code.

Video components normally live in the video project's `packages/` directory. When sharing one across
projects, publish it under your own npm scope or private registry and install a versioned release
through the project's package manager. Proposals for the official Distribution belong in an issue
that explains the shared production need.

## Before you start

Pick up an [open issue](https://github.com/hypit-ai/hypit/issues) or open one describing what you
want to work on. For anything that changes a protocol type, a package boundary or a Provider
contract, describe the approach in the issue first.

## Set up

You need Node.js 22.15+ and pnpm 10.33, selected by the root `packageManager` field.

```bash
corepack enable
pnpm install --frozen-lockfile
```

Live Builds additionally need Python 3.10–3.13, uv, ffmpeg and Chromium. The
[Development Guide](https://hypit.ai/guide/develop/) lists what each one is for.

For a Profile selecting local rendering, run `hypit programs up --runtime <profile> --endpoint
<render-instance>` before the first render (or `hypit runtime up --runtime <profile>` to prepare
the Profile and start its Worker). This explicitly prepares Chrome even when pnpm skips dependency
build scripts. `hypit doctor --runtime <profile>` diagnoses missing setup without installing it.
See the [local renderer README](packages/provider-hyperframes-local/README.md) for browser overrides.

## Make the change

| Where you are working | Guide |
| --- | --- |
| A new Author Package | [Adding an Author Package](https://hypit.ai/guide/author-packages/) |
| A new Provider | [Adding a Provider](https://hypit.ai/guide/providers/) |
| Component internals | [Component Anatomy](https://hypit.ai/guide/component-anatomy/) |
| Studio interface translations | [Localizing Studio](packages/studio/LOCALIZATION.md) |
| Compilation, Runs and Builds | [Runtime](https://hypit.ai/guide/runtime/) |
| Naming, module boundaries, wire data | [Conventions](https://hypit.ai/guide/conventions/) |
| Tests and environment-gated suites | [Testing](https://hypit.ai/guide/testing/) |

English and Chinese documentation live side by side under `docs/` and `docs/zh/`. A change to one
page belongs with the change to its counterpart.

## Check your work

CI runs these commands on every pull request. Run them locally first:

```bash
pnpm check         # TypeScript type-check
pnpm test          # package and service-adapter tests
```

## Report renderer bugs

For rendering bugs, make the report reproducible before proposing a root cause. Include:

1. **Environment** — OS, Hypit CLI version, render provider, browser/renderer version when exposed,
   resolution, fps, and whether the run uses a local or external provider.
2. **Minimal reproduction** — the smallest composition that still fails, plus the command or build
   needed to render it.
3. **Control variant** — a version with one suspected subsystem removed (for example picture or
   audio) while keeping the text graph unchanged.
4. **Timing evidence** — authored and compiled spans for affected elements, including whether any
   spans overlap.
5. **Output evidence** — the affected frame or timestamp and a concise measurement or comparison
   against the clean control when the defect is visual.
6. **Isolation results** — list the changes already tested so maintainers do not repeat eliminated
   hypotheses.

When source text or assets are sensitive, replace the content with neutral placeholders while
preserving the structure, timing, styles, and subsystem that trigger the defect. Avoid claiming the
renderer is at fault until the source graph and the relevant control variants have been checked.

## Package the Distribution

Run `npm run pack:distribution` to build public types and write the release tarball to
`dist/release/`. This stages npm's selected files in a temporary directory and adapts the English
README for the npm page: public image URLs, both GIFs, and a link to the full video examples.
The repository READMEs remain unchanged. `dist/release/README.md` shows the packaged text.

With FFmpeg and FFprobe available, run
`npm run check:distribution -- dist/release/hypit-hypit-<version>.tgz` to install that tarball outside
the checkout, build its chat example component, prepare its font and local renderer, render and export
the video, and decode the result. It disables implicit Puppeteer downloads, checks missing-browser
diagnostics, and prepares the browser in an isolated cache. It uses a separate Hypit state directory, stops its Runtime Worker,
and retains the temporary project on failure. The `npm package execution` workflow runs this on PRs
and is reused by publication; publication uploads the same tarball that was installed and executed.

For a formal release, use the existing GitHub Release workflow. Commit the next stable npm version
in `package.json` to `main`. Open
**Releases → Draft a new release**, choose that commit with tag `v<version>` (for example `v0.1.8`),
write the release notes, and publish the Release. The tagged commit must contain this workflow.
`Publish npm` verifies the tag/version match and that the commit belongs to main's history, runs
Linux/Windows checks, builds and checks the packaged CLI, then publishes to npm as `latest` and
attaches the tarball to the Release. Checks and packaging use the triggering commit, even if main
advances meanwhile. This path supports stable releases, not prereleases.

**Actions → Publish npm → Run workflow** on `main` remains available: enter the committed version
and leave **Publish to npm** unchecked for checks and downloadable packaging only; check it for a
manual npm publication. To finish a failed Release publication, fix the external problem and rerun
that Release's workflow. If code must change, prepare a new version and Release. An existing npm
version is skipped without changing `latest`; an existing Release attachment is retained.
Pushing main, pushing a tag alone, or saving a draft Release does not publish npm. The workflow
does not edit versions or create tags. A visible Release can precede successful npm publication;
check its Actions result before announcing that the npm version is available.

The npm package's Trusted Publisher settings must allow GitHub Actions from organization `hypit-ai`,
repository `hypit`, workflow `publish-npm.yml`, with direct `npm publish` enabled and no environment
name. The publishing job uses OIDC; no npm token secret is needed. An already published version
cannot be overwritten. npm versions such as `0.1.2` are separate from the logical `@1` interfaces.

Release notes should identify the changed user behavior and the affected installation. The npm
Distribution and an installed Skill update separately: link the relevant Skill changes and describe
both update paths when a release changes both. A saved video project and its existing materials are
independent of either installation. After publication, verify the workflow result and npm's
published version before telling users the update is available.

## Open the pull request

Branch names and commit subjects share the same prefix: `feat/`, `fix/`, `docs/` for branches and
`feat:`, `fix:`, `docs:` for commits.

## Issue and PR analysis

Maintainers can request a preliminary AI analysis of an issue or PR from the **Repository analysis**
Actions workflow. Its advice appears only in that run's summary; issue/PR management stays with
maintainers. See the [operator guide](.github/ISSUE_AUTOMATION_DESIGN.md) for inputs and limits.

## Getting help

Ask in [Discord](https://discord.gg/85hnyQnxpn) or [Telegram](https://t.me/hypitai).
