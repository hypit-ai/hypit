# `@svml/cli`

Domain-neutral command engine for Build compilation, execution, inspection and egress.

The engine implements `lock-packages`, `check`, `plan`, `build`, `status`, `builds`, `inspect`, `get`
and `cancel`, but owns no default author vocabulary, Frontend or Provider adapter. Its caller
must pass one explicit `CliDistribution`:

```ts
type CliDistribution = {
  name: string;
  builtInPackageContributions: readonly NodePackageContribution[];
  runFrontends: readonly RunFrontend[];
  createCompiler(options): NodeCompiler;
  createRuntimeFromConfig(path): Promise<LocalRuntime>;
};
```

A Distribution is trusted application assembly, not Core data or source-import authority. The
official `@svml/video-cli` selects `@svml/compiler-text-node` and the current video Runtime
adapters, but no author-package aggregate. A package lock selects the exact Author/Run packages.
Another domain can reuse this command engine without installing any video package.

`check` accepts any self-described Author or Run Source whose Header names a trusted Frontend.
`plan` and `build` require a Run Source. Targets, Candidate selections and substitute fidelity may
not be synthesized by CLI flags; they are visible Run Graph meaning.
