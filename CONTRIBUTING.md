# Contributing to Hypit

Pull requests are welcome. Documentation, examples and translations count as much as code.

[简体中文](./CONTRIBUTING.zh-CN.md)

## Before you start

Pick up an [open issue](https://github.com/hypit-ai/hypit/issues) or open one describing what you
want to work on. For anything that changes a protocol type, a package boundary or a Provider
contract, describe the approach in the issue first — that discussion is cheaper than a rewritten
pull request.

By contributing you accept the terms in [LICENSE](./LICENSE) section 2: the producer may adjust the
license, and contributed code may be used commercially, including in cloud business operations.

## Set up

You need Node.js 22+ and pnpm 10.33, selected by the root `packageManager` field.

```bash
corepack enable
pnpm install --frozen-lockfile
```

Live Builds additionally need Python 3.10–3.13, uv, ffmpeg and Chromium. The
[Development Guide](https://docs.hypit.ai/guide/develop) lists what each one is for.

## Make the change

| Where you are working | Guide |
| --- | --- |
| A new Author Package | [Adding an Author Package](https://docs.hypit.ai/guide/author-packages) |
| A new Provider | [Adding a Provider](https://docs.hypit.ai/guide/providers) |
| Component internals | [Component Anatomy](https://docs.hypit.ai/guide/component-anatomy) |
| Compilation, Runs and Builds | [Runtime](https://docs.hypit.ai/guide/runtime) |
| Naming, module boundaries, wire data | [Conventions](https://docs.hypit.ai/guide/conventions) |
| Tests and environment-gated suites | [Testing](https://docs.hypit.ai/guide/testing) |

English and Chinese documentation live side by side under `docs/` and `docs/zh/`. A change to one
page belongs with the change to its counterpart.

## Check your work

CI runs these three commands on every pull request. Run them locally first:

```bash
pnpm check         # TypeScript type-check
pnpm test          # package, service-adapter and repository-boundary tests
pnpm test:release  # repository hygiene
```

## Open the pull request

Branch names and commit subjects share the same prefix: `feat/`, `fix/`, `docs/` for branches and
`feat:`, `fix:`, `docs:` for commits. Write the subject in the imperative, and describe in the body
what changed and why.

Every change reaches `main` through a pull request.

## Getting help

Ask in [Discord](https://discord.gg/85hnyQnxpn) or [Telegram](https://t.me/hypit).
