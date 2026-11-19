# Project owners and application hosts

> Status: current projection of the system constitution into project facts and product operations.

## One project, multiple authorities

A Project Boundary combines independent author objects and a normal package environment. A useful default
layout is:

```text
project/
├─ hypit.project.json
├─ package.json
├─ package-manager lockfile
├─ media/
├─ packages/
├─ scripts/
├─ edits/
├─ generation/
├─ scenes/
├─ feedback/
├─ exports/
└─ .hypit/
```

Projects may organize objects by episode, shot, campaign or another work structure. The responsibilities of
these locations are:

- `media/` contains media accepted into the project;
- `packages/` contains project-owned components and extensions;
- `scripts/` contains explicit project automation and materialization programs;
- owner documents may appear any number of times in work-specific directories;
- `exports/` contains deliveries;
- `.hypit/` contains rebuildable caches and explicitly selected owner-private recovery data.

A caller opens an explicit object, follows its explicit references, consults stable owner collections such
as `media/`, and uses installed owner readers to project a rebuildable Production Context.

`hypit.project.json` records the boundary display name, explicitly activated npm packages and selected package-owned
catalog offerings. It does not enumerate owner documents or copy package versions. The complete boundary and Host
lifecycle are defined in [Project Boundary and Project Host](project-host.md).

## Facts, views, sessions and caches

| Layer | Persistence | Examples |
| --- | --- | --- |
| Author object | durable | NLE Project, Canvas, Scene, Script, Feedback |
| View | durable editor choice | track lock, durable NLE layout |
| Open Service session | ProjectHost lease lifetime | undo, single writer, watchers, dirty state |
| Host or frontend session | Surface lifetime | selection, playhead, hover, panel state |
| Projection | derived | timeline scene, canvas cards, inspector model |
| Rebuildable cache | derived | waveform, thumbnail, preview frame, object index |

A value enters an author object when it changes the work or a durable author choice. It enters a View when it
changes the reopened editing arrangement. Session values support the current interaction. Projections and
caches derive from their authorities.

## Local filesystem layout

The local Hypit distribution establishes the per-user paths. A source checkout, an npm installation and a desktop
distribution can run the same backend. Desktop, CLI and Agent callers attach to its published endpoint and pass
explicit project paths. The directory containing the executable and the caller's working directory are independent
of these defaults.

These are the defaults for the macOS and Windows Node distribution. Resolve Documents through the operating
system so the user's redirected or relocated folder is honored.

| Purpose | macOS | Windows |
| --- | --- | --- |
| Default parent for new projects | `~/Documents/Hypit/Projects/` | `<Documents>\Hypit\Projects\` |
| Per-user Hypit data root | `~/Library/Application Support/Hypit/` | `%LOCALAPPDATA%\Hypit\` |
| Application configuration | `application/` under the data root | `application\` under the data root |
| Live application endpoint | `runtime/application.json` under the data root | `runtime\application.json` under the data root |
| Live execution endpoint | `runtime/execution.json` under the data root | `runtime\execution.json` under the data root |
| Default HypiHub deployment data | `execution/hypihub/` under the data root | `execution\hypihub\` under the data root |
| Per-user rebuildable cache | `~/Library/Caches/Hypit/` | `%LOCALAPPDATA%\Hypit\cache\` |
| Request staging | OS temporary directory | OS temporary directory |

[Apple filesystem locations](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)
and [Windows known folders](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid) define the
system locations used by these defaults.

- **Projects.** Creating a project uses an explicitly chosen destination or the configured default project parent.
  Each entry is an ordinary Project Boundary with its own files and package lock. Opening a project accepts any
  valid boundary path, including a source checkout, an external drive or another user-selected folder. The default
  parent is a convenience for creating and browsing projects. The chosen project path identifies an open project.
- **Application.** The local distribution owns durable per-user settings such as the chosen default project
  parent and execution environment connection selections. A recent-project list, when persisted, contains paths.
  The endpoint record and lock coordinate the running backend. Open Projects, leases and Product Sessions are
  in-memory ApplicationHost state.
- **Execution.** Each local AIGC Environment owns a persistent data root, which may be set explicitly on its
  deployment. It stores its stable Environment ID, Invocation state, Provider receipts and Publication manifests and bytes. A remote
  Environment owns these on its deployment. The Application retains its connection selection. Closing a project,
  caller or local process preserves durable Environment data for reopening. Receiving a Publication as Project
  Media copies its selected bytes into that Project Boundary through the Media owner.
- **Provider credentials.** The Node host stores OAuth credentials in the current OS account's credential
  store on macOS and Windows. Linux uses owner-private files under the user data root. A HypiHub slot has
  a process-released lock under `credentials/hypihub/` in that root. See
  [Provider authorization](explicit-programs-and-execution.md#provider-authorization).
- **Code.** Application, worker and Provider Endpoint code lives wherever the distribution or package manager
  installed it, or in a developer checkout. The local distribution selects Environment implementations explicitly.
  Project components, Model capabilities and project programs use ordinary project npm dependencies and files.
  FFmpeg and other specialized executables follow the caller's explicit executable selection or OS lookup.
- **Generated working data.** Rebuildable caches belong to their producer and scope. Project-local caches may use
  the Project's `.hypit/cache/`. Request staging holds uploads, captures and other temporary bytes. Recovery facts
  and published generation bytes belong to durable storage.

The Node launcher implements the endpoint path. The HypiHub Node deployment uses the Environment path
for its Invocation and Publication files. Durable Application settings and default project creation use
this layout as their design.

## Service, Executor, Adapter and Host

### Owner Service

An Owner Service opens one object or owner collection. It provides transport-neutral observations and
revisioned operations in that owner's vocabulary.

### Executor

An Executor performs a specific durable or platform-dependent Action. Its request, progress and completion
use the producing owner's types.

### Adapter and Projection

An adapter presents an operation through an Agent tool, CLI, HTTP endpoint, Desktop IPC or Bench. It maps
transport data and applies the Host's permissions.

### Application and Project Hosts

An ApplicationHost is the long-lived backend root shared by Desktop, Agent, CLI and browser adapters in one local or
deployed Hypit instance. It owns ProjectHost leases, Product Providers, Product Sessions and the AIGC Execution Directory.
The Directory is specifically the registry of selected AIGC Provider/model Environments. One ProjectHost selects the
installed package environment and shares project-scoped Services plus AIGC Environment clients for one open Project
Boundary. Specialized Executors such as local audiovisual delivery are injected directly into the Service or Product
that calls them. A Product Session presents one product Surface over that project context. Hosts govern
application and project lifetimes rather than becoming new fact owners, and all of these layers may share one process.

The resulting interactive hierarchy is:

```text
ApplicationHost scope
├─ AIGC Execution Directory
│  └─ connections to selected Execution Environments
└─ ProjectHost scope
   ├─ owner collection and document Service scopes
   └─ interface Product Session scopes
```

An AIGC ExecutionHost is shared across ProjectHosts according to deployment and account policy. ProjectHosts receive
scoped Capability Invocation clients. Product Sessions lease typed owner Services and retain only current interaction state. Desktop,
Codex and other callers open projects through ApplicationHost and can connect to ExecutionHost for standalone execution.

## Product operation forms

- **Observation** reads a finite owner projection;
- **Command** performs a revisioned owner mutation;
- **Action** starts durable or platform-dependent work;
- **Interaction** asks the Host to involve the user or operating system.

An Operation Card records the user intent, owner, operation form, request facts, revision behavior,
success, failure/conflict/cancellation states and projections to refresh. Session gestures record their
interaction behavior locally.

## Main production paths

### NLE

```text
TSX author program + selected owner results
  -> explicit NLE materialization
  -> NLE Project + installed component packages
  -> NLE Project Service + NLE Editing Surface snapshot
  -> NLE delivery compilation
  -> HtmlProgram + AudioProgram
  -> selected HTML video execution
  -> preview, review or delivery file
  -> optional explicit Media adoption
```

NLE owns direct edit time, tracks, items, processing, transitions and delivery intent. It places accepted Media,
project components and live Published Surfaces as explicit occurrences. A TSX author program supplies reusable
component behavior and initial author intent; it does not remain the authority for subsequent direct edits. NLE edits
the materialized Project document and lower it again without re-running the author program.

### Generation

```text
Canvas recipe + selected input values
  -> explicit single-node Invocation
  -> selected Execution Environment
  -> Publication
  -> explicit Canvas selection or owner adoption
```

One Canvas document stores the recipe, typed input links, layout, Invocation attachments and Publication selections.
An input link resolves to an explicitly selected, completed value. Submitting a node attaches its Invocation address.
Selecting a completed Publication is a separate author action. See [Canvas backend design](canvas.md).

### Scene

```text
Scene Project + installed Scene packages
  -> Scene evaluation
  -> live Published Surface
     or explicit record Action
  -> optional Media Asset
```

Scene owns its objects, cameras, performances and local time. Its Published Surface or recorded media enters
final composition through an explicit NLE occurrence.

### Semantic and analysis work

```text
explicit selected media or text
  -> explicit analysis Action or model Invocation
  -> typed evidence / transcript / alignment
  -> owner transaction or project program
```

Analysis outputs keep their capability type and enter author documents through their target owner's
materialization operation.

### Authoring materialization

Authoring is a program boundary rather than a new owner document:

```text
ordinary TypeScript/TSX modules
  -> component declarations and author-time data
  -> explicit materialization
  -> NLE Project facts
```

The NLE Project owns the current edit, and SVML is its persisted representation. Component packages remain ordinary
npm selections with package-owned symbols, parameters and optional authoring contributions.

## Agent-native product direction

An Agent integration connects to the long-lived ApplicationHost and uses the same ProjectHosts, owner Services,
Executors and Product Sessions as visual products. The Agent environment contributes conversation, files, diffs,
tools, browser, permissions, long tasks and navigation. Hypit contributes production facts, operations, execution and
optional professional views.

Timeline, Canvas, Scene, Review, object index and inspector are views over exact authorities. Each view opens
the objects relevant to its production decision and submits edits to their owners.
