# `@hypit/toolchain`

Assembly for the official Hypit toolchain. This package chooses the canonical SVML Block Frontend,
the filesystem Workspace, Source-package discovery and the starter Runtime Profile. It also owns the
`hypit vocabulary` view because that view describes the author packages selected by this Distribution.

Its ordinary npm dependencies select the default author capabilities, Models, Providers and Kits.
Each dependency owns its implementation and version; Toolchain does not bundle or re-export their SDKs.
The root Distribution names Toolchain in `hypit.packageSources` so Source and Profile selections can resolve
these installed defaults from their owner without relying on node_modules hoisting. Project installs
remain higher priority. The root explicitly declares the command packages it invokes.

Toolchain is an assembly package, not the owner of the capabilities it selects. Browser capture, local
media inspection, speech measurement, WhisperX transcription and NLE export remain owned by their
respective packages and contribute their own CLI roots:

| Command | Owner |
| --- | --- |
| `capture` | `@hypit/browser-capture/cli` |
| `media` | `@hypit/media-local/cli` |
| `measure` | `@hypit/speech-estimate/cli` |
| `transcribe` | `@hypit/whisperx/cli` |
| `nle export` | `@hypit/nle-local/cli` |
| `vocabulary` | `@hypit/toolchain/cli` |

The root executable is the composition root. Its explicit `hypit.cli.use` list installs these command
contributions under one `hypit` command; `@hypit/toolchain/cli` does not forward or rediscover them.
Installing or importing an arbitrary Source package never grants it CLI or process authority.

## Application assembly

`createToolchainDistribution()` supplies the generic CLI Host with the official toolchain choices:

- `createToolchainCompiler()` installs the SVML Frontend and assembles selected package declaration compilers,
  Modules and refinements for one Author compilation;
- `createToolchainWorkspace()` resolves Source and asset imports from the project and selected
  Distribution without treating arbitrary package directories as projects;
- `discoverToolchainSourcePackages()` discovers the closure named by explicit Author imports;
- the starter Runtime Profile selects ordinary independently distributed Providers and Credential
  Stores by package name;
- Local Runtime and Result Repository adapters remain Host concerns and do not enter Author values.

These are replaceable product-assembly decisions, not new Core concepts. A different application may
reuse the generic compiler and CLI contracts with another Frontend or Workspace.

## Vocabulary

```bash
hypit vocabulary
hypit vocabulary --visual text
```

The command reports installed Author-package manifests, their fully qualified Capabilities and their
syntax-neutral declaration names. Capability identity and result Type come directly from the named package's Module
Manifest after ordinary package loading; dependency capabilities are not attributed to the package
being listed. It does not keep a registry, scan the network, install packages or make creative
choices. Package managers and the project lockfile own physical package versions; Source imports own
which logical Modules participate in a compilation.

## Boundary

The package may depend on compiler, loader, workspace and product assembly APIs. It must not become a
place to put functionality merely because that functionality ships in the official toolchain. A
capability belongs with the behavior and authority it implements; its optional CLI is only another
port of that owner.
