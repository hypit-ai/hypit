# Hypit

Hypit is a federated, modular, local-first video production system.

A local Project Boundary holds the work's owner documents, accepted media, project components and explicit
references. Agents, applications, CLIs and project programs use owner Services and specialized Executors.
Typed references, Publications, adoption and Published Surfaces connect owners while preserving their
individual meanings and lifecycles.

The [design index](design/README.md) is the architectural entry point. Repository work follows
[AGENTS.md](AGENTS.md).

The authoring and delivery path separates source, editable document and compiled programs.

```text
TSX author program -> NLE Project document -> HtmlProgram + AudioProgram -> video delivery
```

TSX supplies ordinary modules and reusable component declarations. The NLE Project is the durable editable
authority, serialized as SVML. The NLE delivery compiler reads one accepted snapshot and prepares execution programs.
AIGC, semantic and Scene results enter through explicit Publication, Adoption, Reference or Materialization.

Ordinary project programs can call the NLE document and delivery APIs directly. The TSX authoring materializer is planned.

## Initial production paths

The implementation begins with two complete paths:

1. accepted project media and a project component enter an NLE Project and compile to terminal programs for
   a video delivery;
2. an explicit Capability Invocation runs through its selected Execution Environment, closes a Publication,
   enters a target owner through adoption, and participates in an NLE delivery.

Generation Canvas, Scene, semantic understanding, feedback and future owners join through their own facts,
Services and Actions.

TypeScript project programs provide the executable automation surface over Host operations.

## Current implementation

The working core covers Media, NLE editing and video delivery.

- `@hypit/temporal` provides exact clock-free temporal domains and relations;
- `@hypit/media` inspects, selects and interprets picture and audio members;
- `@hypit/media-asset` reads, validates, adopts and resolves portable Media Asset documents;
- `@hypit/application` provides the long-lived ProjectHost, Product Session and AIGC Execution Directory registries plus
  the loopback application adapter;
- `@hypit/application-home` provides the application-level browser Surface for opening a Project Boundary and launching
  a registered product;
- `@hypit/project` opens one Project Boundary, activates its explicit package environment and shares one Media
  Service plus typed owner-document lifetimes among product sessions;
- `@hypit/media-local` implements bounded container-index and explicitly selected decoded-unit inspection
  with local ffprobe;
- `@hypit/nle-delivery` compiles an accepted snapshot and selected package implementations into portable
  `HtmlProgram` and `AudioProgram` outputs and owns the delivery Action;
- `@hypit/html-chromium-local` and `@hypit/html-electron-local` execute the same frame-addressed HTML document through
  frame-buffer or shared-texture capture;
- `@hypit/html-video-local` provides an operating-system `HtmlVideoExecutor` using explicitly selected browser and
  local media tools;
- `@hypit/nle` owns durable direct composition, exact Project transactions and the
  independent `@hypit/nle/view` editing-arrangement and `@hypit/nle/surface` application-composition subpaths while
  keeping renderer execution outside both documents; one Project-owned typed Shared Value registry lets explicit
  Component slots, package Operator parameters and NLE-owned Picture layout slots share values across occurrences and
  Compositions without entering View state or becoming arbitrary document-path relations;
- `@hypit/nle-studio` registers an NLE Product Provider, leases NLE Project and View Services from its selected
  ProjectHost, and projects shared Project Media through its session adapter;
- `@hypit/hypit` composes the default ApplicationHost distribution, publishes its local endpoint and supplies the local
  HTML Video Executor as an NLE Studio Product dependency.

Media Asset documents use the unversioned `hypit.media-asset` format kind. npm semver and the project lockfile
version implementations; the Media Asset Reader accepts the current owner shape.

Run `pnpm build`, then `pnpm application` to start the shared ApplicationHost. `pnpm studio` is the direct
project-and-product launcher for the included NLE project.

The Node Application and direct Studio launchers use ordinary `PATH` lookup for FFmpeg/FFprobe and the local browser
defaults. An embedding or launcher may select explicit executables with `HYPIT_FFMPEG_PATH`, `HYPIT_FFPROBE_PATH`,
`HYPIT_CHROME_PATH` and `HYPIT_ELECTRON_PATH`; these configure the local Executor used by NLE Studio delivery.
