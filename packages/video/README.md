# `@hypit/video`

Assembly for the official Hypit video application. This package chooses the canonical SVML Block Frontend,
the filesystem Workspace, Source-package discovery and the starter Runtime Profile. It also owns the
`hypit vocabulary` view because that view describes the author packages selected by this video
Distribution.

Its ordinary npm dependencies select the default author capabilities, Models, Providers and Kits.
Each dependency owns its implementation and version; Video does not bundle or re-export their SDKs.
The root product names Video in `hypit.packageSources` so Source and Profile selections can resolve
these installed defaults from their owner without relying on node_modules hoisting. Project installs
remain higher priority. The root explicitly declares the command packages it invokes.

It is deliberately **not** a general video utility package. Browser capture, local media inspection,
speech measurement, WhisperX transcription and Studio snapshots are owned by their respective
packages and contribute their own CLI roots:

| Command | Owner |
| --- | --- |
| `capture` | `@hypit/browser-capture/cli` |
| `media` | `@hypit/media-local/cli` |
| `measure` | `@hypit/speech-estimate/cli` |
| `transcribe` | `@hypit/whisperx/cli` |
| `studio`, `snapshot` | `@hypit/studio/cli` |
| `nle export` | `@hypit/video/cli` |
| `vocabulary` | `@hypit/video/cli` |

The root executable is the composition root. Its explicit `hypit.cli.use` list installs these command
contributions under one `hypit` command; `@hypit/video/cli` does not forward or rediscover them.
Installing or importing an arbitrary Source package never grants it CLI or process authority.

## Application assembly

`createVideoDistribution()` supplies the generic CLI Host with video-product choices:

- `createVideoCompiler()` installs the SVML Frontend and assembles selected package declaration compilers,
  Modules and refinements for one Author compilation;
- `createVideoWorkspace()` resolves Source and asset imports from the project and selected
  Distribution without treating arbitrary package directories as projects;
- `discoverVideoSourcePackages()` discovers the closure named by explicit Author imports;
- the starter Runtime Profile selects ordinary independently distributed Providers and Credential
  Stores by package name;
- Local Runtime and Result Repository adapters remain Host concerns and do not enter Author values.

These are replaceable product-assembly decisions, not new Core concepts. A different application may
reuse the generic compiler and CLI contracts with another Frontend or Workspace.

## Local NLE export

```bash
hypit nle export edit.nle.json --to output.mp4
hypit nle export edit.nle.json --to output.mp4 --frame-rate 30000/1001
```

The command opens one persistent `hypit.nle@1` file, loads only the packages named by its Component,
Effect, Transition and matte symbols, resolves primary media files from their Media Asset documents,
then lowers the snapshot through AVIR to `HtmlProgram` and `AudioProgram`. Chromium and FFmpeg execute
inside a request-private file ResourceStore. The completed MP4 is linked into the selected path only
after mux succeeds; an existing output is never replaced.

`--frame-rate` selects delivery sampling and does not reinterpret project times. When omitted, the application uses
the project's `editRate` as a convenient default; the NLE file itself still stores exact rational placements.

This is a direct file task, not a Build or Result export. It creates no Runtime Profile, queue, semantic
dependency or durable prepare state. The same `exportLocalNleProject()` port can be called by another
Host with progress, cancellation and an injected delivery executor.

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
place to put functionality merely because that functionality is useful while making a video. A
capability belongs with the behavior and authority it implements; its optional CLI is only another
port of that owner.
