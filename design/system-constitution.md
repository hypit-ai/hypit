# Hypit system constitution

> Status: supreme architectural authority for the repository.

## Definition

> **Hypit is a federated, modular, local-first video production system. It opens explicit owner documents
> and assets inside a local Project Boundary, lets Agent, App, CLI and project programs call owner Services
> and specialized Executors explicitly, and moves results between owners through declared seams.**

NLE is the primary final-composition owner. Generation, Scene, Media, semantic understanding, Script,
Feedback and future domains are peer members with their own facts and evaluation boundaries. Shared
foundations carry compact neutral values, paths and resource addresses.

## Article I — Project Boundary

A project is an ordinary local directory and package environment. It contains one Project manifest selecting its
active packages and author-facing package offerings, plus owner documents, accepted media, project components and
explicit references. Package versions remain selected by ordinary package-manager files.

A persistent object is located by Project Boundary, project-relative path and document owner. An
owner-defined local id addresses subjects inside that object. Moving an object updates its explicit
references.

The file system provides author-visible persistence. Owner readers interpret files, owner Services edit
them, and ordinary package-manager files select installed implementations.

## Article II — Owner authority

Each domain owns the meaning, validation, editing and persistence of its facts. Primary owners include:

- Media Asset and its accepted representations;
- NLE Project and NLE View;
- Canvas documents;
- Scene Project and Scene View;
- Script, Transcript and semantic evidence;
- Feedback;
- project packages and their owner-specific symbols.

TypeScript/TSX author programs are executable project source. They may materialize reusable component declarations and
initial NLE facts through an explicit project program. The materialized NLE Project owns direct audiovisual editing;
re-materialization or replacement of author source is an explicit operation.

An Owner Service gives an object a real open lifetime. It may provide revisioned commands, observation,
single-writer editing, undo, caching, file watching and saving. Each Service publishes operations in the
vocabulary of its owner.

## Article III — Relationship and action

A relationship records value origin, semantic association, placement, membership or another owner-defined
meaning. For example, `A.output -> B.input` states the selected value source for B.

A user, Agent or explicit project program starts every Invocation and Action. The caller chooses sequence,
parallelism, conditions, repetition and error handling. An unresolved relationship produces an owner
diagnostic identifying the required material.

Canvas records AIGC recipes, typed input relationships, Invocation attachments and explicit Publication
selections. NLE records direct audiovisual composition. Scene records spatial objects, cameras and local
performances. Each owner evaluates its own relations according to its domain.

AIGC, semantic, Scene, Script and other peer results enter TSX or NLE through explicit References, Publications,
Adoption or Materialization. Each peer retains its own evaluation boundary.

## Article IV — Executor authority

An Executor performs work whose duration, failure modes, platform requirements or recovery needs give it a
distinct execution lifecycle. Current executor families include:

- an AIGC Execution Environment performing Capability Invocations;
- audiovisual execution for preview, review and delivery;
- Scene recording;
- transcription and media analysis.

The Executor owns the state required to observe, recover, cancel and complete its Action. Its output stays
typed according to the producing capability or domain.

The program language and operating system execute ordinary functions, file operations, processes and
structured concurrency.

## Article V — Cross-owner seams

Owners cooperate through these seams:

- **Reference** — one owner precisely names another object or owner-defined subject;
- **Occurrence** — an owner records one adoption, placement and local parameterization of a definition;
- **Invocation** — an explicit typed request to an Executor;
- **Publication** — durable completed typed outputs and the resources they own;
- **Adoption / Materialization** — a target owner accepts an output as its own fact;
- **Published Surface** — a strong owner exposes a live typed surface for composition;
- **Projection** — a Host exposes finite observation and operations to Agent, App, CLI or Bench.

Every seam names its two authorities, address basis and lifecycle.

## Article VI — Host hierarchy

An ApplicationHost is the long-lived backend root for one local user or deployment. Desktop, Agent integrations, CLI,
browser products and project programs connect to that same Host through explicit adapters. A caller may start the
ApplicationHost when none is available, but its connection does not define the Host's lifetime.

The ApplicationHost owns the open-ProjectHost registry, Product Provider and Product Session registry, and the AIGC
Execution Directory. One ProjectHost opens each selected boundary, its explicit package environment, its shared Project
Media Service, owner Services and project-scoped AIGC Environment clients. Specialized audiovisual, Scene, analysis
and other Executors are explicit dependencies of the Services or callers that use them. A Product Session binds one
product Surface to that project context. A caller may also use project and owner operations without opening a Product
Session.

Host levels govern composition and lifetime rather than domain meaning. An owner Service retains its typed commands
and revision even when several products share it. Several Services may share a process, and a heavy Executor may use a
dedicated process.

ApplicationHost holds Product Session leases. Each session is associated with one ProjectHost and leases the
owner Services it presents. Several sessions may share one Service and one session may compose several Services.
An ExecutionHost serves one or more independent Environments. ApplicationHost exposes its selected Environments
through the Execution Directory. One Environment can serve several ProjectHosts and direct callers. A recoverable
Capability Invocation can outlive the caller connection, Product Session and ProjectHost that started it.

An application operation has one of four forms:

- Observation reads a finite projection;
- Command performs a revisioned owner mutation;
- Action starts work owned by a concrete Executor;
- Interaction asks the Host to involve the user or operating system.

Studio, Desktop, HTTP, IPC, CLI and Agent tools are adapters over these operations. Closing one caller or Surface
preserves the ApplicationHost, the owner object, recoverable Actions and every Service with a remaining lease.
Frontend tabs and windows are Product Sessions, not owner facts.

## Article VII — Distribution

npm packages and the project lockfile own installed implementation versions. The Project manifest explicitly
activates installed packages and author-facing offerings. Package discovery and loading begins from that explicit
selection and resolves the implementations available to the selected Host and project.

A package represents an independent release, compatibility, ownership, consumer, selection,
platform-weight or deployment boundary. A release unit may contain multiple source modules sharing its lifecycle.

Process-local facets use stable owner-defined kinds. Owner Readers define the current persistent shape.

## Article VIII — Evolution and evidence

Each owner evolves its document formats, Services, Actions and external compatibility promises. Cross-owner
changes update both sides of the seam and preserve their individual authorities.

Type checking, release builds and complete production programs verify the current implementation. Public
documentation describes released behavior, and Git preserves the development history.
