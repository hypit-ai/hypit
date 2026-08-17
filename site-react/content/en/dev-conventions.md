---
title: Conventions
description: Naming, module boundaries, TypeScript configuration and wire data.
---

# Conventions

## Naming

| Thing | Convention | Example |
|---|---|---|
| Package directory | kebab-case | `packages/speech-alignment/` |
| Package name | `@narratage/` scope | `@narratage/speech-alignment` |
| Provider package | `provider-` prefix | `@narratage/provider-kie` |
| TypeScript file | kebab-case | `align.ts` |
| Exported type | PascalCase | `SpeechAlignment` |
| Exported function | camelCase | `createSpeechAlignment` |

## Module boundaries

- Each package has exactly one public entry point: `src/index.ts`.
- Internal modules use explicit `.js` extensions (NodeNext resolution).
- Cross-package imports use `@narratage/*`, never relative paths across package boundaries.
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
- Workspace `package.json` versions remain `0.0.0-dev` until publication. They are physical package
  metadata, not logical protocol identities.
- Exact executable identity comes from locked package bytes and closure digests, not either version
  string.
- Wire types are defined in `@narratage/protocol` and are immutable.
- Nominal Types are owned by Modules, not registered in a central union.
- Type schemas use JSON-compatible structures, not TypeScript interfaces.

## Error handling

- Compilation failures throw with descriptive messages including source location.
- Runtime failures are recorded as Operation failures in the Build state machine.
- Recoverable failures trigger retry according to Endpoint policy after Scheduler resource admission.
- Fatal failures transition the Build to a terminal state.
