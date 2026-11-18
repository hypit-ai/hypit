# Explicit programs and execution

> Status: current execution design for explicit project programs.

## Explicit programs coordinate actions

Hypit separates three kinds of fact:

1. **author relationships** describe value origin, placement and meaning;
2. **explicit programs** decide which actions happen, in what order and under which conditions;
3. **executor state machines** recover concrete durable Actions.

A program uses sequential statements, functions, promises, parallel groups, conditions, loops and error
handling. The language runtime and operating system schedule these operations. Owner documents retain the
author facts, and Executors retain the recovery facts for their Actions.

## Responsibility distribution

| Concern | Authority |
| --- | --- |
| program order, branching and loops | explicit project program |
| ordinary concurrency, processes and file I/O | language runtime and operating system |
| Provider/model/GPU capacity and rate limits | selected Execution Environment |
| submit, poll, collect, cancellation and recovery of one model call | Capability Invocation |
| durable completed typed output | Publication |
| acceptance into the work | target owner Adoption/Materialization |
| timeline edit and delivery | NLE Service and audiovisual executor |
| Scene recording | Scene executor |

After an interruption, a program reads explicit owner facts and Invocation addresses and chooses its next
Action. A program with additional continuation needs may own an explicit script-local checkpoint.

## Capability Invocation and Publication

The Model defines its Capability's typed request and outputs. A Provider Endpoint owns the
wire protocol, credentials, supported request subset and deployment limits. The selected Execution
Environment owns one Invocation lifecycle:

```text
queued -> submitting -> running -> collecting -> received -> complete
                                                      \-> failed / cancelled
```

The Environment checkpoints a durable Provider receipt and resumes the same Provider work. Capacity claims
represent concrete deployment limits such as accounts, model queues, GPU slots and action-rate budgets.
A direct-response Endpoint writes its result into the same staging and goes from `submitting` to `received`.
It checkpoints a service receipt when the service exposes read-only result retrieval.

Capability, Endpoint and Environment are separately selected. A Project may install the Model package.
A Provider Endpoint adapter is an application or worker implementation. An Execution Environment assembles one or
more explicit Endpoint adapters with credentials, capacity and recoverable storage, and publishes a finite capability
projection to its clients. ProjectHost receives a scoped client; it does not absorb the Environment or activate every
installed Provider package.

An Environment may run in the ApplicationHost service process, a dedicated local worker or a remote deployment. The
process placement does not change the Invocation contract. A dedicated Seedance process is justified by its deployment,
recovery, credential or shared-capacity boundary; an in-process Seedance Endpoint adapter uses the same Environment
interface.

A completed recoverable Invocation closes one or more named typed outputs and owned resources as a
Publication. Publication provides an exact stable address for reopening those outputs.

Each Environment owns a persistent data root. A local deployment defaults to its Environment-specific directory
under the distribution's user data root. A deployment may select an explicit location. A remote deployment
owns storage on its side of the connection. Reopening the same Environment identity and data root restores access
to existing Invocation and Publication records independently of the ApplicationHost process and Project location.
See [local filesystem layout](project-owners-and-hosts.md#local-filesystem-layout).

The ApplicationHost's Execution Directory registers and projects available Environments. The selected Environment,
rather than the directory or caller, owns Invocation recovery, Provider receipts and Publication resources. A caller
that reconnects through Desktop, Agent, CLI or browser observes the same recoverable Action by its durable address.
See [AIGC package and deployment boundaries](package-architecture.md#aigc-package-and-deployment-boundaries)
for the npm ownership of the Model, Provider, client and Environment contracts.

Adoption gives the output author meaning:

```text
Invocation -> Publication -> Media adoption -> NLE occurrence
Invocation -> Publication -> Transcript materialization
Scene record -> file -> Media adoption
NLE export -> delivery file -> optional Media adoption
```

## Local Invocation and Publication storage

The local Environment uses one durable directory per Invocation beneath its data root:

```text
execution/<environment-id>/invocations/<invocation-id>/
├─ invocation.json
└─ publication/
   ├─ manifest.json
   └─ files/
```

`invocation.json` holds the request, selected Endpoint and Capability, phase, persisted Provider
receipt and private resume data. The Environment stores the receipt as soon as the Provider acknowledges the
task. A closed Publication is addressed by Environment ID and Invocation ID, with a name for each output.
The manifest records each output's type and value. Resource references resolve to Publication-owned files
described by relative path, media type and size.

## Provider authorization

Connecting or disconnecting an account is an explicit host action. HypiHub owns the authorization
protocol and token rotation. The host supplies a private credential slot with serialized updates and
passes the selected connection to the Environment's Provider. The connection is shared by that
Provider's model requests, reference uploads and receipt lookups. Project documents, Invocation
journals and Publications carry the identities and receipts needed for their own lifecycles.

The local Node host addresses a credential slot by HypiHub origin and host-selected slot id. The slot
persists across callers and processes under the same OS account. The host uses Keychain on macOS,
Credential Manager on Windows, and owner-private files under the user data root on Linux. Token-pair
rotation uses a process-released lock scoped to that slot. A deployment can supply its own store and
serialization boundary explicitly.

The Environment streams caller-supplied input resources into the Invocation before durably queuing it.
Model requests name their input resources. The Model validates resource types and roles. The Endpoint
checks service availability and supported combinations before uploading the staged media.
It collects output bytes in private staging on the same volume and validates the typed outputs before publication.
A process-owned lock guards the local Environment root. The writer places completed files before atomically
committing `manifest.json`. The manifest is the public commit marker. The Environment then records Invocation
completion and clears temporary work. If it stops after committing the manifest, recovery uses that manifest to
finish the Invocation record.
If it stops earlier, recovery continues collection or publication using the saved receipt and available staged
files. An uncertain submission without a receipt first uses the Endpoint's read-only reconciliation when provided.
An unconfirmed outcome closes the Invocation with a diagnostic for explicit caller resolution.

The Environment resolves published outputs and streams their bytes by exact address. Completed Publications
survive process and Project closure. A caller can reuse a Publication as an input or explicitly adopt one
of its outputs through the target owner. Media adoption stores the selected bytes inside the target project.

## Capability selection and capacity

The Model package defines the exact Capability, validates its complete request and declares its output type.
Each Endpoint adapter declares the Capabilities it implements and the subset of concrete requests it supports.
An Environment selects Endpoint instances and may expose an explicit subset of their Capabilities. A project sees
only the capabilities exposed through its permitted Environment clients. Account-specific availability comes from
the selected Endpoint when its service supplies that evidence.

The caller selects an Environment for the Invocation. Within that Environment, an exact Capability uses its sole
eligible Endpoint or an explicit binding when several Endpoints offer it. The selected Endpoint checks the full
request before uploading inputs or submitting paid work. A subsequent attempt can explicitly select another
Environment or Endpoint.

Capacity is configured with the deployment. A whole Invocation claims the shared account or deployment budget
and any narrower model budget together. The model budget can cover one exact model or a group that consumes
the same upstream quota. An Environment serving one account uses that account budget as its total. An Environment
serving several independent accounts may also bound a shared worker resource across them. Endpoints sharing a real
quota use a common budget and one admission authority. Active remote jobs retain their occupancy between polls, and
recovery uses their persisted receipts and claims.

Submit, poll and collect may have independent concurrency or rate limits. These apply to individual actions,
while a model's in-flight limit applies to jobs. Environment limits apply across its callers and projects.
The Provider still enforces the actual account quota, including work submitted outside that admission authority.
The local Node Environment admits jobs against named occupancy budgets and releases remote job claims for
collection. A direct-response call holds its claim until it receives its result. The HypiHub deployment
binds its implemented image, video, speech and transcription Capabilities to one account.

## Project programs

A project program is executable project source. It may:

- read owner documents and selected Publications;
- start and await explicit Invocations and Actions;
- call revisioned owner commands;
- adopt or materialize completed outputs;
- create project components and values;
- use normal modules, functions, conditions, loops and structured concurrency;
- write deliveries to explicit destinations.

TypeScript project programs are the first executable semantic reference. They provide module loading,
typing, control flow, promises, error handling, debugging and operating-system access.

Project programs coordinate owner Actions and commands. A TSX author program is a separate source role: it declares
reusable audiovisual authoring structure and materializes NLE facts. Both use ordinary TypeScript modules, but a project
program does not become an NLE document merely by calling a command, and a TSX author program does not own Invocation
recovery or Executor state.
