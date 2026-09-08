# AGENTS.md

Instructions for coding agents working **on the Hypit repository itself**.

## Scope: read this first

There are two completely different jobs in this codebase, and mixing them up wastes a whole session.

| Job | Where the instructions live |
| --- | --- |
| **Developing Hypit** — packages, CLI, Studio, Runtime, Providers, services, docs, tests | **This file**, plus `docs/guide/` |
| **Producing videos** with Hypit — authoring SVML, cloning a reference video, previewing, Building | The `/hypit` skill at `skills/hypit/SKILL.md` |

If the task is to implement, debug, test, refactor or review repository code, follow this file and
ignore the production routes in the skill. The skill states the same boundary from its own side.

The skill's session-initialization step (`git pull --ff-only origin main`) belongs to video
production. Do **not** run it as part of a development task.

## Project overview

Hypit gives coding agents a language and system to create video. An author writes declarative
source; the compiler turns it into an immutable graph; a Runtime executes that graph through
Providers (generation models, ffmpeg, WhisperX, headless Chromium) and produces a finished video.

Three properties drive most design decisions:

- **The graph is the product, not the render.** A project is re-runnable and editable, so producing
  the hundredth variant costs almost nothing.
- **Timing is anchored to words, not seconds.** Speech alignment drives captions, cuts and overlays.
- **Authority is granted explicitly.** A source `<import>` activates author vocabulary only. It
  never grants network, filesystem, process, credential or queue access. Those come from the
  Runtime Profile.

This is a pnpm workspace of 108 TypeScript packages plus four services.

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
```

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | 22+ | everything |
| pnpm | 10.33.x | pinned by the root `packageManager` field |
| Python | 3.10–3.13 (OpenCV needs 3.13) | the managed WhisperX and OpenCV services |
| uv | latest | Python environments |
| ffmpeg / ffprobe | recent stable | media processing and media tests |
| Chrome / Chromium | managed by HyperFrames | local rendering and the browser-gated test |

Node and pnpm are the only hard requirements for repository work. Everything else gates optional
test suites and live Builds. CI runs Node 22 on both Ubuntu and Windows.

## Commands

```bash
pnpm check         # tsc -p tsconfig.json --noEmit
pnpm test          # every packages/*/test and services/*/test suite
pnpm test:release  # repository hygiene, a separate file pnpm test does not run
```

CI runs exactly those three on every pull request, on Ubuntu **and** Windows. Run all three
locally before opening one. `pnpm test` and `pnpm test:release` are disjoint, so passing one says
nothing about the other.

Optional and environment-gated:

```bash
pnpm test:image-opencv       # needs services/image-opencv/.venv
pnpm test:whisperx-service   # Python unittest; needs Python 3.13 + uv
pnpm smoke:kie               # live and paid; needs HYPIT_KIE_LIVE=1 and KIE_API_KEY
pnpm lockfile:refresh        # rewrite pnpm-lock.yaml so hygiene accepts it
pnpm docs:dev                # VitePress docs site
pnpm build:media-lambda      # the one package with a real build step (esbuild)
```

One browser-gated test has no package script. Run it through the test runner directly:

```bash
HYPIT_BROWSER_TESTS=1 node --import tsx --test packages/provider-hyperframes-local/test/provider.test.ts
```

It renders a real silent MP4 through the installed HyperFrames CLI, so it needs a Chrome that CLI
can start plus `ffmpeg`. Without the variable that one test skips and the rest of the file still
runs, which is what `pnpm test` does.

To run one package's tests:

```bash
node --import tsx --test packages/<name>/test/*.test.ts
```

The CLI and Studio run straight from TypeScript source through `tsx`; there is no build step for
packages, which export `./src/index.ts` directly.

```bash
node bin/hypit.mjs --help    # or ./hypit
pnpm studio
```

## Repository layout

```text
hypit/
├── bin/          hypit, hypit-studio, hypit-preview-check launchers
├── packages/     108 workspace packages, the whole product
├── services/     whisperx, image-opencv, yt-dlp (Python), media-lambda (Node)
├── examples/     runnable example projects and the author-package fixture
├── docs/         VitePress site, English at docs/, Chinese at docs/zh/
├── skills/hypit/ the /hypit production skill, symlinked into .claude and .codex
└── test/         repository-wide tests, the test runner and shared fixtures
```

## Architecture

Packages sit in seven layers. `docs/guide/packages.md` is the authoritative version with every
package listed; this is the shape.

| Layer | What it owns | Examples |
| --- | --- | --- |
| 1. Core | immutable wire contracts, demand compiler, Build state machine. Domain neutral: knows nothing of files, networks, models or video | `protocol`, `core` |
| 2. Compiler | source discovery, Frontends, elaboration, the Node Host | `source`, `elaborator`, `markup`, `svs`, `run-markup`, `compiler-node`, `host`, `workspace` |
| 3. Foundations | deterministic reusable values | `artifact`, `text`, `media`, `temporal`, `spatial`, `visual-ir`, `media-pipeline` |
| 4. Video authoring | the vocabulary SVML actually speaks | `script`, `caption`, `speech-track`, `media-track`, `film`, `composition`, `ranking`, `seedance`, `gpt-image`, `hyperframes` |
| 5. Providers | privileged external capabilities | `provider-kie`, `provider-hypihub`, `provider-media-local`, `provider-hyperframes-local`, `provider-whisperx-local` |
| 6. Runtime | scheduler, worker, stores, credentials, process lifecycle | `runtime`, `runtime-local`, `store-sqlite`, `artifact-store-fs`, `credential-store-os`, `driver-node` |
| 7. Applications | CLIs and Studio | `cli`, `video-cli`, `studio`, `studio-adapter`, `*-studio` companions |

### Dependency rules

These are reviewed as architecture, not enforced by a regex test. Breaking one is a design bug even
when the type-checker is happy.

1. **No cycles** among `@hypit/*` packages.
2. **Core stays domain neutral.** Layer 1 is `protocol` and `core` only, and `core` depends only on
   `protocol`.
3. **No Provider registry in either CLI.** A Build reaches a Provider only through the logical
   `use` names of its Runtime Profile. `@hypit/cli` depends on no Provider at all. `@hypit/video-cli`
   holds exactly one direct Provider dependency, `@hypit/provider-hypihub`, and only for
   `hypit image` — a command that writes one picture with no Runtime Profile, so it has no `use`
   name to resolve. Neither CLI may depend on an author-level video package such as `script`,
   `seedance`, `media-track`, `typography-track` or `film`; those are activated by source imports.
4. **Studio points inward.** A domain package never depends on a Studio companion or on
   `@hypit/studio-adapter`. Each `<name>-studio` depends on its domain package plus the adapter, and
   `@hypit/studio` depends on the companions. Verified: no domain package violates this today.

The `hypit image` exception is deliberate, not drift: the command stands outside the Runtime
Profile system and resolves credentials itself, so the Provider cannot arrive through a `use` name.
Removing that import means inventing a facet shape for Providers usable without a Profile, or
letting `hypit image` accept one. Both are architecture changes; do not attempt either casually.

There is no central `paths` registry in `tsconfig.json`. Every package declares every cross-package
import in its own `dependencies`, and the repository hygiene suite fails a package that imports
something its manifest does not list. That is why the root manifest enumerates ~90 `@hypit/*`
`workspace:*` devDependencies: hygiene lets test files, and only test files, borrow them.

### Package facets

One physical package can expose several independently activated facets: `static`, `author`,
`compute`, `endpoint`, `infrastructure`, `application`. A source `<import>` activates author facets
only. Endpoint and infrastructure facets are reachable exclusively through the Runtime Profile.

## The four project sources

An authored Hypit project (outside this repository) is four files. Knowing them makes the packages
legible.

| File | Responsibility |
| --- | --- |
| `main.svml` | script, narrative, component declarations, prompts, semantic timing |
| `recipes.svs` | style, appearance, playback and layout recipe values |
| `build.svrun` | author binding, Candidates, satisfactions, Targets |
| `hypit.runtime.json` | Runtime packages, Providers, credentials, local execution |

**The file suffix carries no parser authority.** Every source begins with a mandatory header that
names its Frontend by exact package and logical version. No central parser knows every language
feature and there is no suffix dispatch: compilation reads the header, resolves that Frontend from
installed packages, calls its `discover()`, resolves the reported Modules, Run Fragments and child
sources, and repeats until the package subset stops growing. Only then does semantic decoding begin.

| Convention | Header | Frontend | Root element |
| --- | --- | --- | --- |
| `.svml` | `<?svml using="@hypit/markup@1"?>` | `packages/markup` | `<svml>` |
| `.svs` | `<?svml using="@hypit/svs@1"?>` | `packages/svs` | `<sheet version="1">` |
| `.svrun` | `<?svml using="@hypit/run-markup@1"?>` | `packages/run-markup` | `<svrun version="1">` |

`@hypit/markup` owns only the `<svml>` envelope, the import prologue, namespace binding and generic
structured elements. It has no built-in script, media or video vocabulary. Even `<script>` works
only because an imported package contributes that tag through a Markup Surface Host facet.

`hypit check` and `hypit plan` create no Runtime data and write no artifacts. Only `hypit build`
submits work, and it always gets a fresh execution id.

## Adding a package

Full walkthroughs: `docs/guide/author-packages.md`, `docs/guide/providers.md`,
`docs/guide/component-anatomy.md`. The canonical structural fixture is
`examples/minimal-author-package/packages/example-component/`. Read the fixture rather than a
neighbouring production package: one package's specifics are a worse thing to copy than its
structure.

```text
packages/my-thing/
├── package.json
├── src/
│   ├── index.ts        the single public entry point
│   ├── manifest.ts     Module identity, nominal Types, Producers, Surfaces
│   ├── surface.ts      one XML element into typed records
│   ├── fragment.ts     the graph shape a Surface expands into
│   ├── component.ts    the deterministic Producers and Validators
│   └── activation.ts   the passive contribution descriptor the Package Loader reads
└── test/
    └── my-thing.test.ts
```

`package.json` keeps `"version": "0.0.0-dev"`, `"private": true`, `"type": "module"`, exports
TypeScript source directly, and points `"hypit": { "activation": "./src/activation.ts" }` at a
default-exported `NodePackageContribution`. All 108 packages are private and all but `@hypit/studio`
sit at `0.0.0-dev`. 76 declare an activation.

Directories beyond `src/` and `test/` each mean one thing:

| Directory | Meaning | Who has it |
| --- | --- | --- |
| `preview/` | committed preview pictures a Surface declares, sometimes with the `.svml`/`.svrun`/`.svs` that regenerate them | 9 drawing packages |
| `kits/` | data-only `.svs` recipes shipped as subpath exports, no runtime code | `seedance-kits` |
| `runtime/` | non-JavaScript helper scripts the package executes | `credential-store-os`, `provider-image-opencv-local` |
| `bin/` | an executable entry point | `reference-video-tools` |

A package that declares `@hypit/markup` as a dependency is contributing markup vocabulary; 41 do.
That is the practical test for "is this an author package".

Adding a package requires no change to Core, the CLI, any aggregate package, or the root
TypeScript configuration.

### What does not belong in a component package

- Credentials, HTTP, queues or Provider selection.
- Timing resolved from anything but the ProgramSpace and SemanticMap it was handed.
- Access to another Track's values.
- A new field in Core, Composition or Visual IR added to make one component work.

A component's own chrome (board, panel, texture, backdrop) is a file inside the package, read with
`readFile(new URL("../assets/…", import.meta.url))`. A component that cannot draw itself without
the project supplying its background is the wrong shape.

## Code style

There is no ESLint, Prettier or EditorConfig. Match the surrounding code.

- Double quotes, semicolons, two-space indent.
- Relative imports carry an explicit `.js` extension; NodeNext resolution requires it.
- Cross-package imports always use `@hypit/*`, never a relative path across a package boundary.
- `import type { … }` for type-only imports, and `export type * from "./x.js"` for re-exports.
  `verbatimModuleSyntax` is on, so a type imported without `type` survives into the runtime output.
- Imports are grouped: `node:` builtins, blank line, `@hypit/*`, blank line, relative.
- `#private` class fields over `private`.
- Types are PascalCase, functions camelCase, files and package directories kebab-case.
- Package naming carries meaning: `provider-` prefix for Providers, `-studio` suffix for Studio
  companions, a bare product name for a model family (`seedance`, `nano-banana`).
- Comments explain **why**, not what. The existing ones name the failure that made the rule
  necessary; keep that habit.

The strict TypeScript settings change how you write code, not just whether it compiles:

| Setting | Consequence |
| --- | --- |
| `noUncheckedIndexedAccess` | `array[i]` is `T \| undefined`. Narrow it. |
| `exactOptionalPropertyTypes` | you cannot assign `undefined` to an optional property implicitly |
| `verbatimModuleSyntax` | type imports must say `import type` |
| `strict` | no implicit `any`, strict null checks |

## Testing

Node's built-in runner (`node:test`) with `tsx`. Not Jest, not Vitest, not Mocha.

Every one of the 122 existing test files uses the default import and a flat `test()`. None uses
`describe()`.

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { someFunction } from "@hypit/example";

test("someFunction returns the expected result", () => {
  assert.deepStrictEqual(someFunction(input), expected);
});
```

Tests live in `packages/<name>/test/*.test.ts`; fixtures in `packages/<name>/test/fixtures/` as
ordinary `.svml`, `.svs` and `.svrun` files. Within its own package a test imports
`../src/thing.js`; across packages it uses `@hypit/*`.

`test/run.mjs` also globs `services/*/test/` (two files, in `media-lambda`),
`examples/*/packages/*/test/` and root `test/` (both currently empty of `.test.ts`). It resolves
globs in Node rather than through a shell and refuses to run when it matches nothing, because
`node --test` otherwise reports "tests 0" and exits 0.

**Admission rule.** A test belongs in the default suite only when it protects an observable
contract, an architectural boundary, or a failure that could corrupt work, repeat paid execution or
make an environment unsafe. Test a fact once, at its owning layer. Do not add tests to make every
package look covered or to mirror a manifest array. Delete obsolete tests along with the behavior.

**The dominant pattern is pure compilation.** Compile a source, assert on the resulting graph,
exports, Records or plan steps, call nothing external.

**Provider tests gate on the environment** and skip when the credential or executable is absent:

```typescript
test("generates a video", async (t) => {
  if (!process.env.KIE_API_KEY) { t.skip("KIE_API_KEY not set"); return; }
});
```

Never commit customer or brand fixtures, credential traces, paid output artifacts, absolute
workstation paths or one-off delivery harnesses.

## Services

`services/*` are workspace members. The three Python ones ship only a `pyproject.toml`, a committed
`uv.lock` and a `package.json` that exports the pyproject so the Node side can locate it. The
general form is `uv run --project services/<name> --frozen <command>`. `--frozen` is not optional:
it is what keeps the lock authoritative.

| Service | Python | Purpose | Tests |
| --- | --- | --- | --- |
| `whisperx` | 3.10–3.13 | word-level alignment, an HTTP service on 127.0.0.1:8765 | `pnpm test:whisperx-service` (Python `unittest`, invisible to `pnpm test`) |
| `image-opencv` | 3.13 exactly | deterministic OpenCV raster execution | driven from the Node side by `pnpm test:image-opencv` |
| `yt-dlp` | any | reference download, pinned to one exact release so two machines fetch the same bytes | none |
| `media-lambda` | — | Node/TypeScript AWS Lambda handler, the only package with an esbuild build | in `pnpm test` |

Preparing one:

```bash
uv python install 3.13
uv sync --project services/whisperx --frozen
uv run --project services/whisperx --frozen hypit-whisperx-check
```

End users never run these. Selecting an Endpoint and running `hypit runtime up` provisions the
environment in the shared machine program home.

## Repository hygiene: what `pnpm test:release` blocks

`test/repository-hygiene.test.mjs` parses the tree with the TypeScript AST, not with regex over
source text, and starts with a meta-test asserting the scan actually reached the repository. These
rules fail the build, so know them before you write:

- **Workstation paths and secret bytes.** No `/home/<user>/`, `/Users/<user>/`, `C:\Users\<user>\`,
  no `AKIA…`, `AIza…` or PEM private-key headers anywhere in tracked text.
- **`@1` identities only.** Every `@hypit/…@N` and `svml.…@N` logical identity in tracked text must
  be `@1`. Physical package versions stay `0.0.0-dev`.
- **Declared imports.** A file under `packages/*/src/` may import only packages listed in its own
  `dependencies`. Test files may additionally use the package's `devDependencies` and the root
  manifest's dependencies.
- **`windowsHide` on every child process.** Any literal options object passed to a process starter
  must set it. Without it a Windows render opens dozens of console windows over the author's screen.
- **A drawing Surface declares a preview, and that preview image exists.** Publishing a
  `visualTrack` is the structural signal, so a Surface whose outputs include one must declare
  `vocabulary.preview`, and the `previewImage("x.png")` it names must exist and be non-empty at
  `<package>/preview/x.png`. Generate the picture with `hypit image` while authoring and commit it.
- **The lockfile names no untracked importer.** `pnpm-workspace.yaml` reaches into `projects/`,
  which is gitignored, so a local install writes importers a clone does not have and
  `--frozen-lockfile` then refuses the lockfile. `pnpm lockfile:refresh` moves `projects/` aside,
  regenerates, and moves it back. Use it; never edit the lockfile by hand. If a previous run was
  interrupted it exits 2 and asks you to restore the aside directory yourself.

## Security and safety

- **Credentials never enter Git.** `.gitignore` blocks `.env*`, `*.key`, `*.pem`, `*credentials*.json`
  and service-account files. Secrets belong in the selected Credential Store: `credential-store-os`
  (macOS Keychain / Windows Credential Locker) or `credential-store-env`.
- **A Build spends real money.** Generation, media processing and rendering are billed. Never
  submit one on a user's behalf without explicit approval, and never let a test spend money unless
  its opt-in gate is set.
- **Installing a package grants nothing.** A Runtime Profile must select an implementation before
  it can touch the network, filesystem, processes or credentials. Preserve that boundary; do not
  add a shortcut that lets an import reach an Endpoint.
- **Runtime packages are trusted local deployment code**, not a sandbox. Do not describe them as one.

## Documentation

English pages live in `docs/`, Chinese counterparts in `docs/zh/`. **A change to one page belongs in
the same commit as the change to its counterpart.** The same applies to `README.md` /
`README.zh-CN.md` and `CONTRIBUTING.md` / `CONTRIBUTING.zh-CN.md`.

CI skips `docs/**`-only changes, because nothing under `docs/` is in the TypeScript project or
reachable from the test suite.

## Commits and pull requests

Branches and commit subjects share one prefix set: `feat/`, `fix/`, `docs/`, `perf/`, `test/`,
`refactor/`, `chore/` for branches, and `feat:`, `fix:`, `docs:`, `perf:`, `test:`, `ci:`,
`chore:`, `refactor:` for commits. A package scope is common and welcome:
`fix(provider-hypihub): add upload phase diagnostics`.

Open or claim an issue first. For anything that changes a protocol type, a package boundary or a
Provider contract, describe the approach in the issue before writing code.

## Gotchas

- **`.node-version` says 24.14.1, `engines` says `>=22`, CI runs 22.** Do not use an API newer than
  Node 22 without checking CI.
- **Line endings are content.** `.gitattributes` forces `eol=lf` everywhere, because a CRLF
  checkout changes what the compiler, the hygiene scan and every fixture comparison see.
- **Windows is a first-class CI target.** Watch path length, path separators, the `.venv` layout
  (`Scripts/python.exe` vs `bin/python`) and console windows.
- **Wire types in `@hypit/protocol` are immutable.** Nominal Types belong to their Module; there is
  no central union to register in.
- **Media assets are large and tracked.** `.gitignore` lists `examples/**/assets/`, but the 200 files
  already tracked there stay tracked, because ignore rules do not apply to tracked files. Compress
  committing; the last commit on `main` recompressed 228.7 MiB down to 96.6 MiB.
- **`.claude/` and `.codex/` are ignored except for one symlink each.** `.claude/skills/hypit` and
  `.codex/skills/hypit` point at `skills/hypit`, which is the real repository source. Edit the
  skill there.

## Nested AGENTS.md

This is currently the only one. Add a package-local `AGENTS.md` when a package needs instructions
that genuinely differ from the repository defaults; agents read the nearest file in the tree.
