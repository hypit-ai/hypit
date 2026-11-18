# Application, Project and Product Host backend API

> Status: current cross-owner design for connecting callers, Project Boundaries, Product Sessions and execution
> through the same typed backend operations.

## Purpose

Hypit's interactive backend has one long-lived application root, three nested project/interface lifetimes and one
orthogonal execution lifetime:

```text
Desktop · Agent · CLI · browser                  caller lifetimes
        │
ApplicationHost                                  local/deployment service lifetime
├─ ProjectHost registry
├─ Product provider and Product Session registry
├─ AIGC Execution Directory
│  ├─ local Execution Environment                in-process deployment
│  └─ ExecutionHost client                       worker or remote deployment
│     └─ selected Environment
│        └─ Action / Invocation                  recoverable execution lifetime
└─ ProjectHost                                   one Project Boundary
   ├─ Project Media Service
   ├─ Package Environment
   ├─ open Owner Service registry
   ├─ Project Resource Gateway
   └─ Product Session                            one interface lifetime
      └─ NLE Studio, Canvas, Scene or another product Surface
```

These levels govern composition, identity and lifetime. They do not merge owner facts:

- ApplicationHost owns the open-project registry, Product Session registry and shared execution access;
- ProjectHost owns one open Project Boundary and its shared project services;
- a Product Session owns one product's finite projection and interface session state;
- an Owner Service owns author-document commands and revisions;
- an Executor owns a long-running or platform-dependent Action.

Desktop, Agent, CLI and browser adapters choose their own presentation and navigation. They attach to the same
ApplicationHost and resolve projects, products and execution through its shared registries.

## Scope and uniqueness

A runtime service lives at the narrowest Host scope shared by every caller that requires the same live identity:

| Runtime identity | Unique key | Lifetime owner |
| --- | --- | --- |
| Application backend | local user or deployment endpoint | ApplicationHost |
| AIGC Execution Directory | ApplicationHost instance | ApplicationHost |
| Project runtime | canonical Project Boundary | ProjectHost registry |
| Project Media collection | ProjectHost | ProjectHost |
| open owner document | owner kind and project-relative path | ProjectHost document registry |
| product Surface | Product Session handle | ApplicationHost session registry |
| Invocation | Environment and Invocation address | selected Execution Environment |

The AIGC Execution Directory is one shared registry per ApplicationHost. It may expose several local and remote Provider/model Execution
Environments. ProjectHosts receive scoped clients to those Environments, so shared execution capacity stays above the
project boundary while Invocation recovery and Publication resources stay with their selected Environment.

The contracts in this document precede HTTP, IPC, CLI and Agent adapters. An adapter encodes the same operations; it
does not reimplement their business meaning.

## Operation forms

Every public Host operation has one form:

| Form | Meaning | Typical result |
| --- | --- | --- |
| Observation | Read one finite current projection | snapshot or scene |
| Command | Perform one revisioned owner mutation | receipt and invalidations |
| Action | Start fallible, long-running or platform-dependent work | observable Action handle |
| Interaction | Ask the application or operating system to involve the user | selected local capability |

A pointer gesture may remain in the browser while it is provisional. Pointer release submits one semantic operation.
The frontend may choose presentation and temporary feedback, but it does not authoritatively choose track allocation,
transaction boundaries, media interpretation, package resolution or Action recovery.

## ApplicationHost

### Lifetime and identity

One ApplicationHost lives for one local user or deployment endpoint. It is a long-lived backend service that may run
in its own process or be embedded by a distribution. It canonicalizes Project Boundary paths and opens at most one
ProjectHost for each boundary in that Host instance. Desktop, Codex, CLI and browser adapters connect to the same
instance. Its Project and Product Session handles are opaque, Host-local capabilities; neither is persisted into owner
documents.

The distribution registers Product Providers once at this application scope because they are factories for creating
Product Sessions. Registration states which product kinds this application can launch. It does not move the launched
product's owner facts into application scope: every NLE Studio session still receives one selected ProjectHost, opens
project-owned NLE and View Services and retains only interface-session state of its own.

Opening the same canonical boundary returns a lease on the existing ProjectHost. Closing one caller, window or tab
releases its leases and Product Sessions, not the shared ProjectHost while another lease remains. Starting an
ApplicationHost when no endpoint is available is deployment bootstrap, not a domain operation.

### Caller relationship

| Caller | ApplicationHost use |
| --- | --- |
| Desktop | presents windows and tabs, performs native Interactions and launches Product Sessions |
| Agent integration | leases projects, calls owner operations and Actions, and opens a Product Session when a visual Surface is useful |
| CLI | performs explicit project, owner or execution operations through a bounded caller lease |
| Browser product | observes and operates one Product Session through its local adapter |
| Project program | calls typed project, owner and execution contracts inside its explicit run |

Presentation, navigation, conversation and native operating-system affordances belong to the caller adapter. Project,
product and Action handles resolve through the ApplicationHost. A distribution may supervise the service process, and
all connected callers observe the same Host registries.

### Typed contract

```ts
type ApplicationProjectId = string;
type ApplicationProjectLeaseHandle = string;
type ApplicationProductSessionHandle = string;

type ApplicationProductLaunchParameter = {
  readonly name: string;
  readonly title: string;
  readonly required: boolean;
  readonly initial?: string;
  readonly placeholder?: string;
};

type ApplicationProjectLease = {
  readonly handle: ApplicationProjectLeaseHandle;
  readonly project: ApplicationProjectId;
  readonly host: ProjectHost;
  close(): Promise<void>;
};

type ApplicationProductSessionLease = {
  readonly handle: ApplicationProductSessionHandle;
  readonly project: ApplicationProjectId;
  readonly product: string;
  readonly session: ProductSession;
  close(): Promise<void>;
};

type ApplicationProjection = {
  readonly products: readonly {
    readonly product: string;
    readonly title: string;
    readonly launchParameters: readonly ApplicationProductLaunchParameter[];
  }[];
  readonly projects: readonly {
    readonly id: ApplicationProjectId;
    readonly name: string;
    readonly leases: number;
    readonly sessions: readonly ApplicationProductSessionHandle[];
  }[];
  readonly sessions: readonly {
    readonly handle: ApplicationProductSessionHandle;
    readonly project: ApplicationProjectId;
    readonly product: string;
  }[];
  readonly execution: readonly ExecutionEnvironmentProjection[];
};

interface ApplicationHost {
  observe(): ApplicationProjection;
  subscribe(listener: ApplicationEventListener): () => void;
  openProject(input: unknown): Promise<ApplicationProjectLease>;
  closeProject(handle: ApplicationProjectLeaseHandle): Promise<void>;
  launchProduct(input: {
    readonly project: ApplicationProjectLeaseHandle;
    readonly product: string;
    readonly input: unknown;
  }): Promise<ApplicationProductSessionLease>;
  closeProduct(handle: ApplicationProductSessionHandle): Promise<void>;
  project(handle: ApplicationProjectLeaseHandle): ProjectHost;
  session(handle: ApplicationProductSessionHandle): ApplicationProductSessionLease;
  close(): Promise<void>;
}
```

`product` selects one explicitly registered Product Provider. The provider validates its own `input`; ApplicationHost
does not define a central union for NLE, Canvas, Scene and future products.

Each provider may publish finite text launch parameters for an application-level launcher. Their names and validation
remain owned by the selected provider. Application Home renders the declarations and submits the resulting value as
that provider's opaque `input`.

Project identity and caller ownership are separate. `ApplicationProjectId` identifies the one open runtime in the
finite application projection. Each `ApplicationProjectLeaseHandle` gives one caller authority to retain and access
that runtime. A Product Session retains the runtime independently, so releasing the caller's project lease does not
close a still-open product.

Creating a Project Boundary is an explicit ApplicationHost Action that writes a selected project template and package
environment before opening it. Selecting a directory, choosing import files, revealing a result or choosing a delivery
destination is an Interaction implemented by the connected caller adapter, not a durable Project fact.

An Agent or CLI caller may open a Project lease and call ProjectHost, owner and Execution operations directly. A
Product Session is required for operations that use product-specific context and interface state. A terminal
caller can lease such a session without opening a visual Surface.
See [Hypit CLI and shared Host operations](cli.md) for the terminal command surface and its use of the local API.

## ProjectHost

### Shared project context

ProjectHost remains the one composition root for:

```ts
interface ProjectHost {
  readonly boundary: ProjectBoundary;
  readonly packages: ProjectPackageEnvironment;
  readonly media: ProjectMediaService;
  readonly documents: ProjectDocumentRegistry;
  readonly resources: ProjectResourceGateway;
  readonly executionClients: readonly ProjectExecutionClient[];
  executionClient(environment: string): ProjectExecutionClient | undefined;
  observe(): Promise<ProjectHostProjection>;
  subscribe(listener: ProjectHostEventListener): () => void;
}
```

Its finite projection contains the boundary display name, selected package names, offering identities and titles,
Project Media Catalog, permitted Execution Environment IDs and open Owner Service leases. ApplicationHost projects
its attached Product Sessions. An Environment ID selects the project-scoped client, even when multiple Environments
use the same deployment kind.
Absolute paths, loaded package functions and raw Service instances stay behind trusted local adapters.

### Project operations

The current shared operations are:

- observe the Project manifest, package selections, catalog offerings and open-service inventory;
- observe and explicitly refresh the shared Project Media Catalog;
- adopt a selected local file through the Project Media adoption Action;
- open a typed owner document through its registered Owner Provider;
- issue and revoke Project resource capabilities;
- close all project-scoped services after the last application lease closes.

Owner document creation, saving and reloading remain Owner Provider operations. ProjectHost coordinates their
lifetime but does not manufacture a universal document format or command vocabulary.

Media adoption and NLE placement are separate operations. Adopting bytes creates a Media Asset and refreshes the
shared Catalog. Placing that Media Asset creates an occurrence in one NLE Project. Project Media does not maintain a
reverse-reference database, content hash, file freshness state or consumer usage list.

## Product Providers and Product Sessions

### Provider seam

An ApplicationHost registers selected Product Providers explicitly:

```ts
interface ProductProvider<Session extends ProductSession = ProductSession> {
  readonly product: string;
  readonly title: string;
  open(project: ProjectHost, input: unknown): Promise<Session>;
}

interface ProductSession {
  observe(request: unknown): unknown | Promise<unknown>;
  close(): void | Promise<void>;
}
```

The generic seam owns registration and lifetime only. Each product publishes its own typed observations, commands,
operations and resource projections. Product Session state such as selection, playhead, hover, viewport and pending
pointer drafts remains session-local and does not enter ProjectHost or owner documents.

### NLE Studio session

An NLE Studio Product Session leases one NLE Project Service and one optional durable NLE View Service from its
ProjectHost. It exposes the Project Media Catalog and selected package offerings alongside the NLE Editing Surface.

Its stable application contract is grouped by meaning instead of one route for every button:

```ts
interface NleStudioProductSession {
  observe(request: NleStudioObservationRequest): Promise<NleStudioObservation>;
  subscribe(listener: NleStudioEventListener): () => void;
  command(command: NleEditingSurfaceCommand): Promise<NleStudioOperationReceipt>;
  operate(operation: NleStudioOperation): Promise<NleStudioOperationReceipt>;
  startAction(request: NleStudioActionRequest): Promise<NleStudioActionObservation>;
  observeAction(handle: string): NleStudioActionObservation;
  cancelAction(handle: string): NleStudioActionObservation;
  save(): Promise<NleStudioOperationReceipt>;
  reload(): Promise<NleStudioOperationReceipt>;
  resource(token: string): ProjectHostResourceResolution;
  close(): Promise<void>;
}
```

`command` exposes already closed owner commands. `operate` accepts one product-level user intent, validates the active
Project and View revisions, plans all required owner commands and commits the operation once. It is the correct seam
for interactions whose authoritative result must not be reconstructed independently by each frontend.

The [Studio protocol](../packages/nle-studio/src/protocol.ts) defines the exact union. Timeline operations cover
drop, trim, split, remove, slip, roll, end-edge ripple trim, ripple removal, closing a gap and picture-only retime.
Materialization covers Media, holds, Component, Process, Adjust, Transition and nested Composition. Media,
Component and Composition placement accept an explicit insertion scope. The session also exposes clipboard,
Composition navigation and edits, Process and Transition edits, Component Media binding, and audio detachment.

### Authoritative Timeline drop

Timeline drop is the first required planner. The request identifies:

- the selected existing Items and their anchor;
- the active Composition and observed Project/View revisions;
- signed frame-grid displacement;
- vertical drop position or an explicit destination Track;
- whether the pointer targets an existing Track or a new-track boundary.

The backend resolves compatibility and locks, excludes moved Items' original ranges from conflict checks, searches
available Tracks, creates required Tracks, preserves multi-selection offsets and submits one Project transaction. The
receipt returns the committed anchor Track, revisions and invalidated projections. The frontend projects pointer
feedback and observes the committed destinations.

### Canvas Product Session

The Canvas Product opens one Canvas document through the selected ProjectHost and projects its cards,
input relationships, Media and attached Invocation observations. See [Canvas Host and open lifetime](canvas.md#host-和打开期).

## Specialized Actions and the AIGC Execution Directory

A Product or owner Service projects the Action handle of the specialized Executor it calls. Local audiovisual and
media Executors use ordinary operating-system processes, files and structured concurrency and arrive as explicit
Service or Product dependencies from the application distribution.

The ApplicationHost Execution Directory exposes selected AIGC Provider/model Execution Environments and
project-scoped Capability Invocation clients. A recoverable Invocation address remains observable after its initiating
caller or Product Session disconnects.

The first product-facing Action kinds are:

```ts
type ProductActionRequest =
  | MediaThumbnailRequest
  | MediaStoryboardRequest
  | MediaWaveformRequest
  | MediaAudioPreviewRequest
  | NleFramePreviewRequest
  | NlePlaybackPreviewRequest
  | NleProgrammeWaveformRequest
  | NleExportRequest;
```

Every specialized Action publishes through its owning Service or Executor:

- an opaque owner-local handle;
- queued, running, completed, failed or cancelled state;
- finite progress and a direct diagnostic;
- cancellation when the selected Executor supports it;
- completed typed resources or a delivery result;
- the lifetime promised by that Action owner.

Thumbnail, storyboard and waveform caches are rebuildable Executor results. Preview and export consume the same
accepted NLE snapshot and delivery compilation, while their clocks, buffering, encoding and process state remain Executor-private.

The AIGC Execution Directory is application-scoped, while each selected Environment owns its own credentials,
Provider/model capacity, Invocation journal, Provider receipts and Publication resources. ApplicationHost routes and
projects those authorities; ProjectHost receives scoped Capability Invocation clients. A completed Publication enters
Project Media or another owner only through an explicit Adoption or Materialization Action.

Execution results have explicit ownership transitions:

```text
Capability Invocation state            selected AIGC Execution Environment
completed recoverable typed output     Publication in that Environment
accepted audiovisual asset             Project Media Service after Adoption
placed audiovisual occurrence          NLE Project after Materialization
```

The selected AIGC Environment keeps Invocation addresses reachable across caller connections and preserves recoverable
state plus Publication resources. Other Action owners preserve only the lifecycle they explicitly promise; the target
owner preserves material accepted into the project.

## Observation, receipts and events

An initial Product Session observation is complete enough to render the selected Surface. Mutations return compact
receipts:

```ts
type ProductOperationReceipt = {
  readonly operation: string;
  readonly revisions?: Readonly<Record<string, number>>;
  readonly invalidated: readonly string[];
  readonly result?: unknown;
};
```

The backend also publishes scope-specific events for completed changes and Action progress. Events contain handles,
current revisions or generations and invalidated projection names. They do not carry a second durable history or make
event delivery authoritative. A client that misses an event reads the current finite projection again.

Event scopes are:

- ApplicationHost: Project lease and Product Session lifecycle;
- ProjectHost: Media Catalog generation and open-service inventory;
- Product Session: NLE Project and View revisions, savepoints and projection invalidations, plus Project Media changes;
- Action: Preview, Media views and Delivery handles, state and progress in the Studio stream.

The selected package environment and execution directory are fixed for their open lifetimes. On opening or
reconnecting, a client subscribes before reading the finite projection. Loopback streams signal subscription with
`ready`, then each live change with `change`. A slow connection can be closed so the caller reconnects and rereads.

## Local HTTP projection

The current loopback application adapter projects control operations and mounts each product adapter beneath its
opaque Product Session path:

```text
GET    /api/application
GET    /api/application/events
POST   /api/application/projects
GET    /api/application/project-leases/:lease
GET    /api/application/project-leases/:lease/events
DELETE /api/application/project-leases/:lease
POST   /api/application/sessions
DELETE /api/application/sessions/:session
GET    /api/application/execution/:environment/capabilities
GET    /api/application/execution/:environment/doctor
POST   /api/application/execution/:environment/quote
POST   /api/application/execution/:environment/invocations
GET    /api/application/execution/:environment/invocations/:invocation
POST   /api/application/execution/:environment/invocations/:invocation/cancel
GET    /api/application/execution/:environment/invocations/:invocation/publication
GET    /api/application/execution/:environment/auth
DELETE /api/application/execution/:environment/auth
POST   /api/application/execution/:environment/auth/attempt
GET    /api/application/execution/:environment/auth/attempt/:attempt
POST   /api/application/execution/:environment/auth/attempt/:attempt
DELETE /api/application/execution/:environment/auth/attempt/:attempt

GET    /home/:capability/
*      /home/:capability/api/application/*

GET    /sessions/:session/
*      /sessions/:session/*
```

Application control operations require the server's bearer token. A Product Session URL contains an opaque session
capability and routes only to the adapter registered for that session's product kind. The Application Home capability
mount projects project and session operations to its browser artifact. Execution routes require the bearer token
on the direct loopback endpoint, and can select an existing project lease with `?project=<lease>`.
Resource capability tokens
remain scoped to the Project or Product Session that issued them and are revoked with that scope. A browser URL,
server port, iframe address or HTTP request body never becomes an owner fact.
The Project stream closes when its lease is released. Within a Studio Session, `GET /api/events` closes with the
Session.

Desktop IPC, CLI and Agent adapters attach to the same ApplicationHost instance and invoke the same typed ProjectHost,
Product Session and Action operations. An in-process adapter calls the typed contracts directly; a separate process
uses the selected local transport.

## Capability audit

逐项产品能力、Owner 边界和实现状态见
[NLE 后端能力审计](nle-backend-capability-audit.md)。本节只保留跨 Owner 的结论和闭合顺序。

### Established foundations

The current implementation already provides:

- an ApplicationHost registry that canonicalizes Project Boundaries and returns explicit caller leases;
- one ProjectHost per open boundary with close-on-last-lease/session behavior;
- explicit Product Provider registration and opaque Product Session handles;
- an application loopback adapter for project leases, Product Session launch and session-path routing;
- an Application Home capability route and browser artifact for product launch and active-session projection;
- permission-restricted local endpoint publication and live Application instance validation;
- an application AIGC Execution Directory that opens project-scoped clients from selected Provider/model Environments;
- a typed Node project client for durable AIGC Invocation, cancellation, Publication manifests and resource streaming;
- Project Boundary manifest and package activation;
- one ProjectHost with shared Media, package, document and resource services;
- local Media inspection, atomic adoption, Catalog refresh and byte-range resource access;
- NLE Project and View Services with independent revisions, transactions, undo, redo, savepoints and explicit reload;
- NLE Editing Surface observations, guards, Inspector and spatial plans;
- direct commands for Track, Item, source-time, Process, Transition, Matte and shared-value editing;
- Media, Component, Process, Adjust, Transition and nested Composition materialization;
- an NLE Studio Product Session capable of opening over an existing ProjectHost;
- Application and Project observations, Studio finite observations and compact mutation receipts;
- subscription and loopback events for Application, Project, Studio and audiovisual Actions;
- exact-range frame and playback preview, Programme waveform and Delivery through one Studio Action projection;
- generation-scoped Media thumbnail, storyboard, waveform and audio audition, with bounded Timeline viewport demand.

Remaining execution work and decisions about editor behavior and owner facts are tracked in the
[NLE backend capability audit](nle-backend-capability-audit.md).
