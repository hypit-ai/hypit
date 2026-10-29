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

Live Builds additionally need Python 3.10–3.13, uv, ffmpeg and Chromium when the selected
packages use them. Follow the README of the Provider or local service you are changing for its
exact environment and verification commands.

For a Profile selecting local rendering, run `hypit programs up --runtime <profile> --endpoint
<render-instance>` before the first render (or `hypit runtime up --runtime <profile>` to prepare
the Profile and start its Worker). This explicitly prepares Chrome even when pnpm skips dependency
build scripts. `hypit doctor --runtime <profile>` diagnoses missing setup without installing it.
See the [local renderer README](packages/provider-html-local/README.md) for browser overrides.

## Make the change

| Where you are working | Guide |
| --- | --- |
| A new Author Package | [Adding an Author Package](https://hypit.ai/guide/author-packages/) |
| A new Provider | [Adding a Provider](https://hypit.ai/guide/providers/) |
| Component internals | [Component Anatomy](https://hypit.ai/guide/component-anatomy/) |
| Studio interface translations | [Localizing Studio](packages/studio/LOCALIZATION.md) |
| Compilation, Runs and Builds | [Runtime](https://hypit.ai/guide/runtime/) |

Follow the nearest package or service README for precise APIs and scripts. Cross-package ownership
and repository-wide boundaries are maintained in [AGENTS.md](AGENTS.md), rather than duplicated in
a public development guide.

English and Chinese documentation live side by side under `docs/` and `docs/zh/`. A change to one
page belongs with the change to its counterpart.

## Check your work

CI runs these commands on code pull requests. Run them locally first:

```bash
pnpm check         # TypeScript type-check
pnpm test          # package and service-adapter tests
```

Hypit tests are organized by the fact they own, not by a unit/integration/e2e pyramid:

- `packages/<name>/test/` verifies package-owned values and behavior;
- `packages/<name>/test/composition/` verifies one direct handoff;
- `test/workflows/` verifies a small number of complete public flows;
- `packages/<name>/test/environment/` files run only through an explicit
  `node test/run.mjs environment <package>` or
  `node test/run.mjs environment <package>/<test>` selection.

Use `node test/run.mjs package <name>` while changing one package and `node test/run.mjs workflow
<name>` for a repository workflow. The default `pnpm test` suite excludes environment-owned browser,
media, Python and process behavior.

Before adding a test, identify the observable fact, its owner, and the failure that no existing test
would reveal. Keep the test at that owner; a consumer tests only the relationship it uses. Do not
mirror Manifest arrays, internal state objects or implementation call order. A fixture may reduce
syntax, but must not choose a Model, Provider, Output, recovery rule or domain relation for its
consumers. Delete tests with obsolete behavior rather than retaining them as project history.

## Package the Distribution

### Build and publish

Run `npm run pack:distribution` to build public types and write the release tarball to
`dist/release/`. This stages npm's selected files in a temporary directory and adapts the English
README for the npm page: public image URLs, both GIFs, and a link to the full video examples.
The repository READMEs remain unchanged. `dist/release/README.md` shows the packaged text.

With FFmpeg and FFprobe available, run
`npm run check:distribution -- dist/release/hypit-hypit-<version>.tgz` to install that tarball outside
the checkout, build its chat example component, prepare its font and local renderer, render and export
the video, and decode the result. It disables implicit Puppeteer downloads, checks missing-browser
diagnostics, and prepares the browser in an isolated cache. It uses a separate Hypit state directory, stops its Runtime Worker,
and retains the temporary project on failure. Set `npm_config_cache` to reuse downloaded package
bytes; the consumer project, node_modules, Runtime state and browser installation remain isolated.
CI runs `npm package execution` alongside the repository checks and uploads the tested candidate.

For a formal release, commit the intended versions to `main` and wait for **CI** to succeed. It runs
repository checks and candidate packing in parallel, then installs and executes that same candidate
on Linux and Windows. PRs use the same checks but their artifacts are not publication candidates.
Documentation-only changes skip automatic CI; run **Actions → CI → Run workflow** on `main` when
such a commit is intended for release. One successful CI run supplies the `npm-package` artifact.

Then publish a GitHub Release tagged `v<version>` at that exact tested commit. **Publish npm** finds
the successful main CI run for the tag, downloads its artifact, checks the version and npm state,
publishes dependencies before the root, and attaches the tested root tarball to the Release. It does
not compile, reinstall or render again. The tag must contain this workflow. Stable releases only.

For manual publication or an independent-package update, open **Actions → Publish npm → Run workflow**
on `main` and enter the successful **CI run ID**. Leave **Publish** unchecked to download and inspect
the candidate without npm writes; check it to publish. The run ID selects the tested files even if
main has since advanced. The **packages** input selects exact space-separated names, such as
`@hypit/studio`; empty selects the complete candidate. This does not require a new root version when
the existing root dependency ranges remain valid. Locally the equivalent selection is
`node scripts/publish-release-candidate.mjs dist/release/release-plan.json --package=@hypit/studio`.

If publication or attachment fails, rerun publication with the same candidate, not CI. Matching
immutable npm versions are skipped; existing Release attachments are retained. A publishing-tool
fix can be committed to main and used with the original CI run ID. If the artifact has expired or
is missing, run CI again explicitly. A failed check or npm preflight consumes no version. Once a
package version is on npm, changing that package's bytes requires a new version; retrying its
unchanged publication does not. Pushing main, pushing a tag alone, or saving a draft Release does
not publish npm. Check the publication result before announcing availability.

Workspace release dependencies use explicit compatibility ranges, such as `workspace:^0.4.0`;
packing removes the workspace prefix without raising the minimum to the current checkout version.

The npm package's Trusted Publisher settings must allow GitHub Actions from organization `hypit-ai`,
repository `hypit`, workflow `publish-npm.yml`, with direct `npm publish` enabled and no environment
name. The publishing job uses OIDC; no npm token secret is needed. An already published version
cannot be overwritten. npm versions such as `0.1.2` are separate from the logical `@1` interfaces.

Trusted Publisher authority belongs to each npm package rather than to the `@hypit` scope. When a
new independently published package first enters the Distribution, download the successful CI
candidate, sign in with `npm login`, then publish and bind that new package:

```sh
gh run download <ci-run-id> --name npm-package --dir <candidate-directory>
node scripts/publish-release-candidate.mjs <candidate-directory>/release-plan.json --package=@hypit/new-package
npm exec --yes --package=npm@^11.15.0 -- node scripts/configure-release-publishers.mjs <candidate-directory>/release-plan.json --package=@hypit/new-package
```

The publication command selects only the named new package, not the root Distribution; existing
versions are skipped only when their registry integrity matches the candidate. The trust command
uses npm 11.15 or newer to bind the named package to this repository and workflow. Omit `--package`
only when bootstrapping every independent package in a new release plan. npm's first authorization
page can grant a five-minute window for the remaining package bindings; the command spaces requests
to stay within registry limits. This is package creation, not a normal release step. Do not retain a
long-lived npm publication token or publish the root Distribution from the workstation. After the
package bindings exist, rerun the Release workflow; it verifies matching immutable versions and
continues through OIDC.

Release notes should identify the changed user behavior and the affected installation. The npm
Distribution and an installed Skill update separately: link the relevant Skill changes and describe
both update paths when a release changes both. A saved video project and its existing materials
are independent of either installation. After publication, verify the workflow result and npm's
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
