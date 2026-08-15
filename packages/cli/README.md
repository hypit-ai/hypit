# `@narratage/cli`

Domain-neutral command engine for Build compilation, execution, inspection and egress.

The engine implements `check`, `plan`, `build`, `status`, `builds`, `inspect`, `get`
and `cancel`, but owns no default author vocabulary, Frontend or Provider adapter. Its caller
must pass one explicit `CliDistribution`:

```ts
type CliDistribution = {
  packageRoot?: string;
  bootstrapPackages: readonly LoadedPackage[];
  createCompiler(options): NodeCompiler;
  runtimeProfileRevision(path): Promise<string>;
  createRuntimeFromConfig(path): Promise<CliRuntime>;
};
```

A Distribution is trusted application assembly, not Core data or source-import authority. The
official `@narratage/video-cli` selects `@narratage/compiler-markup-node` and the current video Runtime
adapters, but no author-package aggregate. Source imports select Author and Run packages from the
project's installed dependencies.
Another domain can reuse this command engine without installing any video package.
The Worker lifecycle compares only the opaque revision supplied by the Distribution; the command
engine does not parse a Runtime Profile or know which files that Profile considers deployment input.

`check` accepts any self-described Author or Run Source whose Header names a trusted Frontend.
`plan` and `build` require a Run Source. Targets and Candidate selections may
not be synthesized by CLI flags; they are visible Run Graph meaning.

The command engine has one structured presentation seam. `check`, `plan` and `doctor` currently
render compact human output by default; `--verbose` reveals closure identities and complete lists,
while explicit `--json` preserves full machine-readable data without ANSI or progress prose.
TTY capability is supplied only by the executable Distribution entrypoint. Providers, components
and Frontends return structured facts and never print directly to the terminal.
