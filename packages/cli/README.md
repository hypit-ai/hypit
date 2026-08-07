# `@svml/cli`

Domain-neutral command engine for Build compilation, execution, inspection and egress.

The engine implements `lock-packages`, `check`, `plan`, `build`, `status`, `builds`, `inspect`, `get`
and `cancel`, but owns no default author vocabulary, entry Frontend or Provider adapter. Its caller
must pass one explicit `CliDistribution`:

```ts
type CliDistribution = {
  name: string;
  builtInPackageContributions: readonly NodePackageContribution[];
  createCompiler(options): NodeCompiler;
  createRuntimeFromConfig(path): Promise<LocalRuntime>;
};
```

A Distribution is trusted application assembly, not Core data or source-import authority. The
official `@svml/video-cli` selects `@svml/compiler-text-node`, `@svml/prelude-video` and the current
video Runtime adapters. Another domain can reuse this command engine without installing those
packages.
