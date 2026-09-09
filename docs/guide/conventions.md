---
title: Conventions
description: Naming, module boundaries, TypeScript configuration and wire data.
---

# Conventions

These conventions describe work inside the Hypit repository. Project extensions use their owner's scope and the public `@hypit/hypit/*` SDK subpaths; see [Packages and Extension](./packages.md).

## Naming

| Thing | Convention | Example |
|---|---|---|
| Package directory | kebab-case | `packages/speech-alignment/` |
| Package name | `@hypit/` scope | `@hypit/speech-alignment` |
| Provider package | `provider-` prefix | `@hypit/provider-kie` |
| TypeScript file | kebab-case | `align.ts` |
| Exported type | PascalCase | `SpeechAlignment` |
| Exported function | camelCase | `createSpeechAlignment` |

## Module boundaries

- A package declares its public entry points in `package.json` exports; `src/index.ts` is the usual workspace entry.
- Internal modules use explicit `.js` extensions (NodeNext resolution).
- Cross-package imports use `@hypit/*`, never relative paths across package boundaries.
- Circular production dependencies are forbidden.

## TypeScript configuration

The root `tsconfig.json` checks the workspace through ordinary pnpm package links. It contains no
central `paths` registry: every package must declare every cross-package import in its own
`dependencies` or `devDependencies`.

| Setting | Value |
|---|---|
| Target | ES2023 |
| Module | NodeNext |
| Module resolution | NodeNext |
| `strict` | `true` |
| `noUncheckedIndexedAccess` | `true` — indexed access returns `T \| undefined` |
| `exactOptionalPropertyTypes` | `true` — `undefined` must be explicit |

Adding a package does not require changing the root TypeScript configuration.

## Wire data

- All persisted data uses the `@1` wire format version.
- Project-owned Module and Frontend identities use the literal logical version `1`.
- Package versions select physical releases through npm or pnpm. They are distinct from logical
  Module and Frontend interface versions.
- npm or pnpm owns installed package versions and bytes. Hypit identities describe semantic
  Modules, Frontends, Fragments and implementations rather than pretending to hash an installed package.
- Wire types are defined in `@hypit/protocol` and are immutable.
- Nominal Types are owned by Modules, not registered in a central union.
- Type schemas use JSON-compatible structures, not TypeScript interfaces.

## Error handling

- Compilation failures throw with descriptive messages including source location.
- Runtime failures are recorded as Operation failures in the Build state machine.
- Providers own bounded transport retries where their service protocol permits them.
- A failed execution attempt ends the Build. Further work uses a new Run and Build, with completed
  Outputs explicitly selected for reuse.
