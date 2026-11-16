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
| Author object | durable | NLE Project, Graph, Scene, Script, Feedback |
| Workspace or View | durable author/editor choice | selected Publication, track lock, durable layout |
| Open Service session | application lifetime | undo, single writer, watchers, dirty state |
| Host or frontend session | Surface lifetime | selection, playhead, hover, panel state |
| Projection | derived | timeline scene, canvas cards, inspector model |
| Rebuildable cache | derived | waveform, thumbnail, preview frame, object index |

A value enters an author object when it changes the work or a durable author choice. It enters a View when it
changes the reopened editing arrangement. Session values support the current interaction. Projections and
caches derive from their authorities.

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

An Application Host owns project selection and shell-level Product Session navigation. One ProjectHost selects the
installed package environment and shares project-scoped Services and Executor clients for one open Project Boundary.
A Product Session presents one product Surface over that project context. Hosts govern application and project
lifetimes rather than becoming new fact owners, and all of these layers may share one process.

The resulting interactive hierarchy is:

```text
Application scope
├─ shared ExecutionHost and Execution Directory
└─ Project scope
   ├─ owner collection and document Service scopes
   └─ interface Product Session scopes
```

ExecutionHost is shared across ProjectHosts according to deployment and account policy. ProjectHosts receive scoped
Execution clients. Product Sessions lease typed owner Services and retain only current interaction state.

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
  -> audiovisual representation / Programme
  -> selected audiovisual executor
  -> preview, review or delivery file
  -> optional explicit Media adoption
```

NLE owns direct edit time, tracks, items, processing, transitions and delivery intent. It places accepted Media,
project components and live Published Surfaces as explicit occurrences. A TSX author program supplies reusable
component behavior and initial author intent; it does not remain the authority for subsequent direct edits. NLE edits
the materialized Project document and lower it again without re-running the author program.

### Generation

```text
Graph recipe + Workspace selection
  -> explicit single-node Invocation
  -> selected Execution Environment
  -> Publication
  -> explicit Workspace selection or owner adoption
```

Graph relations describe typed inputs. An operation-source input resolves to an explicitly selected,
completed value. Invoking a node attaches that node's Invocation and Publication.

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

A capable Agent Host is the long-lived product root. Hypit contributes owner facts, Services, Executors,
production knowledge and optional professional views. The Host contributes conversation, files, diffs,
tools, browser, permissions, long tasks and navigation.

Timeline, Canvas, Scene, Review, object index and inspector are views over exact authorities. Each view opens
the objects relevant to its production decision and submits edits to their owners.
