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

You need Node.js 22.12+ and pnpm 10.33, selected by the root `packageManager` field.

```bash
corepack enable
pnpm install --frozen-lockfile
```

Live Builds additionally need Python 3.10–3.13, uv, ffmpeg and Chromium. The
[Development Guide](https://hypit.ai/guide/develop/) lists what each one is for.

## Make the change

| Where you are working | Guide |
| --- | --- |
| A new Author Package | [Adding an Author Package](https://hypit.ai/guide/author-packages/) |
| A new Provider | [Adding a Provider](https://hypit.ai/guide/providers/) |
| Component internals | [Component Anatomy](https://hypit.ai/guide/component-anatomy/) |
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

## Package the Distribution

Run `npm run pack:distribution` to build public types and write the release tarball to
`dist/release/`. This stages npm's selected files in a temporary directory and adapts the English
README for the npm page: public image URLs, both GIFs, and a link to the full video examples.
The repository READMEs remain unchanged. `dist/release/README.md` shows the packaged text.
Publish the resulting tarball with `npm publish dist/release/hypit-hypit-<version>.tgz --access public`.

## Open the pull request

Branch names and commit subjects share the same prefix: `feat/`, `fix/`, `docs/` for branches and
`feat:`, `fix:`, `docs:` for commits.

## Getting help

Ask in [Discord](https://discord.gg/85hnyQnxpn) or [Telegram](https://t.me/hypit).
