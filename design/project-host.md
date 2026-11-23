# Project Boundary and Project Host

> Status: current owner and Host design for opening one local Hypit project, selecting installed packages and
> sharing project-scoped services among products.

## Boundary

A Hypit Project is an ordinary local directory. Its identity is the selected directory, not a generated database id.
The directory contains one small Project manifest, the normal package-manager environment, accepted Media and any
number of independently owned documents.

The Project manifest owns only boundary-wide author choices:

- the display name of the project;
- the npm packages explicitly activated for this project;
- the package-owned catalog offerings that products may present as author creation choices.

Media Assets, NLE documents, Canvas documents and exports remain ordinary owner files and stable owner collections.
Open tabs remain Product Session state. `package.json` and the lockfile select installed package versions.

`ProjectHost` is the one open runtime for this boundary inside one ApplicationHost instance. It opens the manifest and
package environment, owns the shared Project Media Service lifetime, reuses owner Services for documents opened by
several callers and supplies one project context to Product Sessions. Media, NLE, Canvas and other owners retain the
meaning and operations of their facts.

## Default project layout

The local distribution proposes a default parent for new Project Boundaries and accepts an explicitly selected path
when opening or creating one. See [local filesystem layout](project-owners-and-hosts.md#local-filesystem-layout)
for the macOS and Windows defaults.

```text
documentary/
├─ hypit.project.json
├─ package.json
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
├─ media/
│  └─ interview/
│     ├─ interview.media.json
│     └─ interview.mp4
├─ edits/
│  ├─ full-version.svml
│  └─ trailer.svml
├─ generation/
├─ scenes/
├─ scripts/
├─ packages/
│  └─ documentary-titles/
│     ├─ package.json
│     └─ src/
├─ exports/
└─ .hypit/
   ├─ cache/
   └─ recovery/
```

`hypit.project.json`, `package.json` and the package-manager lockfile are required bootstrap files. The workspace file
joins the package environment when the project contains local packages. The remaining locations are conventions owned
by their domains:

- `media/` is the stable Media Asset collection opened by the Project Media Service;
- `edits/`, `generation/` and `scenes/` may contain any number of owner documents;
- `packages/` contains project-authored ordinary workspace packages;
- `scripts/` contains explicit project programs;
- `exports/` contains delivery outputs and does not imply Media adoption;
- `.hypit/` contains rebuildable cache and explicitly selected recovery state, never the only copy of author facts.

An owner document may live elsewhere in the boundary when its references remain portable. Folder names do not select
an owner; the owner Reader and explicit caller do.

## Project manifest

The first manifest shape is deliberately finite:

```json
{
  "format": "hypit.project",
  "name": "Documentary",
  "packages": [
    {
      "name": "@hypit/captions",
      "catalog": [
        "caption.clean",
        "caption.yellow-outline"
      ]
    },
    {
      "name": "@documentary/titles",
      "catalog": [
        "title.chapter"
      ]
    }
  ]
}
```

The Project Reader accepts exactly the current fields. Package names are unversioned npm package names. Package-local
catalog ids are stable opaque names declared by that package. An empty `catalog` activates the package's technical
contributions without adding an author-facing creation choice.

The two selections have different meanings:

1. `packages[].name` explicitly permits the Host to load that installed package's Hypit entry;
2. `packages[].catalog` selects the package-owned offerings shown by creation surfaces.

Catalog selection does not determine whether an existing owner reference remains meaningful. For example, hiding a
caption preset from an add menu does not invalidate an NLE Item already using the package's Component symbol. Package
activation, package symbol resolution and author-facing catalog selection remain distinct.

The manifest contains no wildcard meaning “all installed packages” or “all future offerings”. A project template may
write a useful initial explicit selection. Updating a package does not silently publish newly added author choices into
an existing project's catalog.

## Package environment

The Project Package Environment combines three authorities without merging them:

```text
package.json                requested npm dependencies and workspace links
package-manager lockfile    exact installed implementation selection
hypit.project.json          explicitly activated packages and visible offerings
```

The Node ProjectHost requires `pnpm-lock.yaml` and reads the project's installed `node_modules` layout. Every
activated package is declared as a direct dependency in the Project's `package.json`. The loader matches the resolved
export against that project's installed package directory, following the package manager's workspace and store
links. It loads an explicit `./hypit` export with the named value `hypitPackage` and verifies the declared name.
Fontsource package references use the same installed dependency lookup.

A Hypit package module may publish many technical contributions and many catalog offerings:

```ts
type HypitPackageModule = {
  readonly package: string;
  readonly contributions: readonly {
    readonly kind: string;
    readonly value: unknown;
  }[];
  readonly catalog: readonly {
    readonly id: string;
    readonly kind: string;
    readonly title: string;
    readonly value: unknown;
  }[];
};
```

`kind` is owned and validated by the consuming owner or product contract. The Project package layer does not define a
central union of NLE Components, Operators, caption styles, filters, transitions, Media Representation Readers or
future capabilities. It provides exact package selection, module provenance and duplicate detection; typed owner
registries interpret selected contributions.

One author-facing offering may assemble several technical facets. A caption offering may use one Component Source,
one Component definition with a Track role and text reader, parameter authoring, an Inspector projection and package resources.
Those facets do not need separate installation records. Conversely, one package can expose caption offerings,
Operators and transitions without being split merely for taxonomy.

For example, NLE Studio consumes `hypit.nle-authoring`, `hypit.nle-component-definition` and
`hypit.nle-inspector-presentation` contributions using the public NLE Host contracts. Its creation browser consumes
selected `hypit.nle-component`, `hypit.nle-adjust` and `hypit.nle-transition` offerings. These names and values remain NLE product contracts; ProjectHost merely
preserves their selected package provenance and does not acquire an NLE dependency.

Project-authored packages under `packages/` participate through ordinary workspace dependencies. They are selected in
the manifest exactly like registry packages. Official packages distributed with a Hypit application are project
template defaults, not invisible global implementations: creating a project writes their dependencies, lockfile
selection and manifest activation. The package manager may deduplicate bytes in its store; every project still owns
its reproducible dependency selection.

Installing, updating or removing package dependencies is an explicit package-manager Action. Opening a Project never
installs missing packages. A missing activation reports the exact package and referring owner object. An installation
workflow first completes the package-manager operation and validates the Hypit module, then atomically records the
manifest activation. Catalog edits are direct Project manifest commands and do not rewrite owner documents.

## Host hierarchy and lifetimes

```text
ApplicationHost                         local/deployment service lifetime
├─ caller connections                   Desktop · Agent · CLI · browser
├─ ProjectHost registry
├─ Product Provider and Session registry
├─ AIGC Execution Directory
└─ ProjectHost                           one per open Project Boundary
   ├─ Project manifest Service
   ├─ Project Package Environment
   ├─ Project Media Service              one shared collection
   ├─ Open Owner Service Registry
   │  ├─ NLE Project Service             one per open .svml document
   │  └─ future owner Services
   ├─ selected AIGC Environment clients
   ├─ Host resource gateway
   └─ Product Sessions
      ├─ NLE Product Session
      ├─ another NLE Product Session
      └─ Canvas Product Session
```

The ApplicationHost is the shared backend control plane. It selects or creates Project Boundaries through explicit
operations and reuses one ProjectHost per canonical boundary in its service lifetime. Desktop, Agent, CLI and browser
adapters attach to this registry. Each adapter owns its presentation and navigation, while Product Session identity and
ProjectHost leases remain coordinated by the ApplicationHost.

The ProjectHost is the project-scoped composition root. It closes all project-scoped resources together, but its
child Services retain their owner-specific APIs and revisions.

A product adapter supplies one product's transport and frontend composition. An NLE session backend opens or leases
an NLE Project Service, passes its navigation and Track locks to the NLE Editing Surface, and receives the same
Project Media Service and Package Environment used by other products.

A Product Session is one open product Surface presented by a browser page, Desktop tab, window or Agent view. Several
sessions may lease the same open owner Service. Selection, playhead, hover, viewport and pointer drafts remain session
state; the shared Service remains open while any lease exists.

## Lifecycle scopes

The interactive backend opens shared project Services and product interfaces. Execution has a deployment lifetime:

```text
ApplicationHost                              local/deployment service scope
├─ AIGC Execution Directory ── clients ── ExecutionHost
│                                         └─ Environment and Invocations
└─ ProjectHost                               project scope
   ├─ ProjectMediaService                    owner collection scope
   ├─ PackageEnvironment                     project package scope
   ├─ NleProjectService and other Services   owner document scope
   └─ ProductSession                         interface session scope
```

ApplicationHost scope owns project discovery, the ProjectHost registry, shared AIGC execution access and Product Session
registration. Project scope owns one open Project Boundary and its shared project resources. Collection and document
scopes give owner facts real open lifetimes. Interface scope owns current selection, playhead, zoom, hover, panel and
pointer state. Caller adapters own their windows, tabs, conversations and command presentation.

A Product Session leases one or more typed owner Services. Several Product Sessions and caller adapters may lease the
same document Service. An AIGC ExecutionHost may serve several ProjectHosts, and a Capability Invocation may continue after its
initiating caller, Product Session or ProjectHost has closed. Reopening a project reconnects to that Invocation through
its durable address.

## Execution Environments

Provider accounts, model queues, GPU slots, rate limits, durable Provider receipts and recovery belong to an account,
worker or execution-deployment lifetime. The ApplicationHost exposes selected Environments through its AIGC Execution
Directory, and each ProjectHost receives scoped clients to them.

```text
ExecutionHost
├─ cloud Environment
│  ├─ Seedance Endpoint Adapter
│  └─ another Provider Endpoint Adapter
└─ local GPU Environment
   └─ local model Endpoint Adapter

ApplicationHost ── Execution Directory ── scoped clients for open projects
```

The ApplicationHost explicitly registers selected Environments and their clients. An Environment publishes a finite
capability projection. The ProjectHost receives clients permitted for that project, and a user, Agent or project
program explicitly starts each Invocation against a selected compatible Environment. The client is addressed by the
Environment ID. The project projection lists only IDs for which the project holds a client lease.

Four selections remain separate:

1. a Model package defines a Capability's typed request and outputs;
2. a Provider Endpoint adapter implements one Provider/model wire protocol and supported request subset;
3. an Execution Environment supplies credentials, capacity, scheduling and recoverable Invocation storage;
4. the Invocation caller selects the concrete available Environment for one Action.

A Seedance adapter initially may run in the same Node process as the ApplicationHost while retaining this contract.
Deployment, recovery, credential isolation and shared-capacity requirements may place that Environment in a separate
worker or remote service while preserving the same Canvas, ProjectHost and Invocation/Publication seams.

ApplicationHost deployment configuration selects usable Environments and the credential sources available to them.
Each Environment owns its Provider credentials, account-wide capacity, Invocation recovery and Publication resources.
Project packages select Model capabilities and authoring contributions. A project document may retain explicit
Invocation and Publication references.

## Shared Media

The Project Media Service is unique for:

```text
ApplicationHost instance + Project Boundary
```

More concretely, it is constructed and closed by the corresponding ProjectHost. NLE, Canvas, Scene, Agent and Media
surfaces in that project observe the same catalog instance.

The shared Media identity is the portable project-relative Media Asset manifest path, for example
`media/interview/interview.media.json`. Each SVML document stores a pointer relative to its own file and resolves it
to that identity. Two documents in different directories may spell their pointers differently and share the asset.

Different Hypit Project Boundaries do not share a Media identity. Moving material across them is an explicit adoption
or materialization Action into the target Project Media Service. Physical storage deduplication, if ever supplied by a
storage implementation, cannot decide author identity.

The ProjectHost does not duplicate a Media list in the Project manifest. The Media Catalog is reconstructed from the
owner manifests in `media/`. The Project Media Service opens the organization of those assets from its
[Media library document](media.md#project-media-library), `media/library.json`.

For [source previews](media.md#source-preview-cache), the local distribution binds the Media
executor to the open Project Media Service and supplies the project's cache directory. ProjectHost shares this
port with its product sessions and direct project callers. It manages the open binding and resource leases.
Media Local owns cache addressing, generation and retention.

## Open owner documents

Owner Providers give the ProjectHost the platform adapter required to create, read, save and reopen one owner kind.
The Host's Open Service Registry keys a live Service by:

```text
owner kind + canonical project-relative document path
```

Opening the same NLE document from two tabs returns leases on one `NleProjectService`; opening two `.svml` files opens
two Services. Each tab keeps its own active Composition and Track locks.

The Node Project file adapter resolves existing paths and containment before leasing owner documents. Aliases
inside one Project resolve to one file identity. New files and delivery targets validate their containing directories.

The generic registry owns identity, lease count and close behavior. The NLE session backend calls
`NleProjectService`, the Media adapter calls `ProjectMediaService`, and future owners preserve their own typed
contracts.

Saving remains explicit. An Owner Provider serializes the selected Service snapshot, atomically writes its file and
advances that Service's savepoint. Direct external file edits remain valid author actions and enter an open Service
through explicit reload or reopen.

## Transport-neutral API shape

The independent package should be `@hypit/project`. Its root entry contains Project manifest values and Readers,
package contribution contracts, typed project context and lifecycle registries. Its `node` entry contains local path,
file, npm resolution and atomic persistence adapters.

The intended public composition is:

```ts
const project = await openNodeProjectHost({
  root,
  ownerProviders,
  productProviders,
  executionClients,
});

project.boundary;                  // canonical root and current manifest observation
project.packages.contributions();  // exact activated package provenance
project.packages.catalog();        // selected author-facing offerings
project.media;                     // the shared ProjectMediaService
await project.media.adoptFile(...); // Node facet; one serialized Media adoption Action
project.documents;                 // typed provider + path Service leases
project.resources;                 // invocation-local Host resource addresses
project.products;                  // Product Session launch and close

await project.close();
```

The document registry preserves provider typing instead of returning an untyped universal service:

```ts
const lease = await project.documents.open(nleProjectProvider, "edits/trailer.svml");
lease.service.transact({ expectedRevision, commands });
lease.close();
```

An NLE product launch is application coordination rather than an NLE command:

```ts
const project = await application.openProject({ root: "/work/documentary" });
const session = await application.launchProduct({
  project: project.handle,
  product: "hypit.nle-studio",
  input: { document: "edits/trailer.svml" },
});
```

Creating a blank NLE first asks the NLE Owner Provider to create a new `.svml` document at an explicit project path,
then launches a Product Session over that document. ProjectHost supplies the context but does not manufacture SVML.

## Backend and frontend boundary

The first complete local deployment may use one long-lived Node process and one loopback HTTP server. Host boundaries
do not imply process boundaries:

```text
Desktop · Agent · CLI · browser
  callers and product surfaces
        │ typed adapter
Loopback Application adapter / direct client
  ApplicationHost
        │
  ProjectHost registry
        │
  owner/product HTTP adapters
```

A caller uses Application operations to create or open a project. Visual callers may launch a product, receive an
opaque Product Session address and present it in a tab or window. Agent and CLI callers may invoke ProjectHost, owner
and Execution operations without creating a Product Session.

The browser receives finite projections and submits typed product operations. Absolute filesystem paths, imported
package functions and raw Service instances remain behind the loopback adapter. Host resource URLs are
session-scoped projections for Media thumbnails, package posters and preview frames; they are not persistent owner
references.

The Project Resource Gateway issues opaque project-lifetime capabilities over Host-resolved resources. A Product
Session owns the subset it requested, turns those capabilities into its own transport URLs and revokes them when the
session closes. The Node resolver canonicalizes a declared file inside the Project Boundary before registration.
HTTP byte ranges, response headers and browser authorization remain product-adapter behavior.

The ProjectHost package does not own browser chrome or a universal JSON command protocol. Application HTTP, Desktop
IPC, CLI and Agent tools attach to the same ApplicationHost and remain adapters over typed Host and owner contracts.

The Node Project Media facet is the shared headless import boundary for those adapters. A trusted CLI or native
adapter may pass a selected local path directly. A browser adapter first streams bytes into a temporary file. Both
invoke the same adoption Action, and neither creates an NLE Item, Canvas node or another owner fact as an implicit
side effect.

## Release shape

The justified release graph becomes:

```text
@hypit/media-asset  -> Project Media Service modules
@hypit/project      -> Project manifest, package environment and ProjectHost
@hypit/application  -> ProjectHost registry, Product Sessions and AIGC Execution Directory
@hypit/nle          -> NLE owner facts and Services
@hypit/nle-studio   -> NLE product adapter and browser client
@hypit/hypit        -> ApplicationHost composition and distribution defaults
```

`@hypit/project` does not depend on NLE, Canvas or future owner implementations. Owner Providers and Product Providers
depend on its context contract. It may depend on the Media Asset release because every ProjectHost constructs the one
stable Project Media Service for its boundary. Platform package-manager execution remains a selected Executor or Node
adapter, not part of the manifest Reader.

ApplicationHost is the root distribution composition. Product UIs remain with their product adapter packages, and
Execution Environment implementations retain independent deployment and release boundaries where their platform,
credential, recovery or capacity requirements demand them.

## First implementation slice

The first implementation should close one actual shared-project path:

1. read `hypit.project.json`, `package.json` and the existing lockfile;
2. resolve only explicitly activated package modules and assemble typed NLE contributions;
3. open one Project Media Service and reconstruct its Catalog from `media/`;
4. open two NLE documents through one Open Service Registry;
5. expose the same Media Catalog to both NLE Product Sessions;
6. drag one catalog entry into each document so both store the same Media Asset manifest path;
7. save, close the ProjectHost, reopen the directory and reconstruct the same owner facts;
8. report a precise package diagnostic when a referenced package is not activated or installed.

Type checking, release builds and this direct production path are the evidence.
