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
- Circular dependencies are forbidden (enforced by `tools/package-boundaries.test.mjs`).

## TypeScript configuration

`tsconfig.json` extends `tsconfig.json` and adds `paths` mappings for all `@narratage/*` packages.

| Setting | Value |
|---|---|
| Target | ES2023 |
| Module | NodeNext |
| Module resolution | NodeNext |
| `strict` | `true` |
| `noUncheckedIndexedAccess` | `true` — indexed access returns `T \| undefined` |
| `exactOptionalPropertyTypes` | `true` — `undefined` must be explicit |

When adding a new package, add its path mapping to `tsconfig.json`:

```json
"@narratage/my-package": ["packages/my-package/src/index.ts"]
```

## Wire data

- All persisted data uses the `@1` wire format version.
- Wire types are defined in `@narratage/protocol` and are immutable.
- Nominal Types are owned by Modules, not registered in a central union.
- Type schemas use JSON-compatible structures, not TypeScript interfaces.

## Error handling

- Compilation failures throw with descriptive messages including source location.
- Runtime failures are recorded as Operation failures in the Build state machine.
- Recoverable failures trigger retry according to the Scheduler's lane policy.
- Fatal failures transition the Build to a terminal state.
