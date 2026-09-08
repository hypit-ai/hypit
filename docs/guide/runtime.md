---
title: Runtime
description: The execution boundary outside Hypit source and Core.
---

# Runtime

Hypit keeps four decisions separate:

| Owner | Decides |
|---|---|
| Workspace | Which source files and local assets compilation may read |
| Runtime Profile | Which environmental packages may be used |
| Local Runtime | How active Builds are durably advanced and observed |
| Project Build Results | Which completed public Outputs belong to each Build |

Core is a domain neutral state machine. It accepts facts, derives Commands and verifies returned
Records. It does not start processes, read credentials, choose Providers or know that a Build makes
video.

`@hypit/runtime-local` is the default execution environment. It owns one Worker, scheduler, the
pending-submission and active-execution state, and one SQLite database. Those are one implementation,
not user-selectable pseudo-components.

## Runtime Profile

The Profile contains only environmental choices that genuinely vary:

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/local",
  "credentials": {
    "env": { "use": "@hypit/credential-store-env" }
  },
  "endpoints": {
    "media": { "use": "@hypit/provider-media-local" }
  },
  "bindings": {}
}
```

* `credentials` selects stores for explicit credential references.
* `endpoints` selects exact Provider implementations and their configuration.
* `bindings` says which Endpoint serves a capability that several selected Endpoints offer, keyed by
  `name@version#capability` and naming an Endpoint instance. Providers never hide what they can do;
  this is the deployment's decision, and `doctor` reports a contested capability that lacks one.

The official video Distribution selects the local Runtime before opening this file. The Profile
does not repeat a `runtime.use` selector that cannot make another choice. Another application may
provide a different Runtime Host at its Distribution assembly boundary without changing Core or
the generic CLI.

Result storage belongs to the project, not the execution environment. A project may select it in
`hypit.results.json`; omitting the file uses the same filesystem default:

```json
{
  "format": "hypit.build-results@1",
  "use": "@hypit/build-result-fs",
  "config": { "path": ".hypit/results" }
}
```

Installing a package only makes an implementation available. A Profile must select it. The Profile
contains no Workspace, author imports or creative routing.

## Local state

Selecting a Profile writes a project pointer. Execution data stays under `dataRoot`:

```text
.hypit/
  runtime
  runtimes/
    local/
      runtime.sqlite
      work/
      worker/
      programs/
  results/
    <UTC-date>/
      <build-id>/
        result.json
        files/
        values/
```

`check` and `plan` do not create Runtime data. Submission first prepares a non-schedulable row.
Only after the Result draft, attachments and working directory exist does one SQLite transaction make
the Build claimable. A pending submission left by a hard interruption is removed only by the exact
`hypit result discard <build-id>` operation; nothing scans or guesses.

An Execution stores active facts, Provider Operations, `wakeAt`, its current turn, cancellation, one
immutable decision and optional attention. It stores no phase. Once Result saving and working-directory
cleanup succeed, one transaction removes all owned SQLite rows with the Execution root last. Runtime
retains no finished Build-history row.

Every Build committed to a persistent Runtime must provide its project Result location and Author
Catalog. Execution without a Result is not a hidden alternate mode.

Historical content lives in the selected project Result repository, not Runtime SQLite. With the
default repository, `.hypit/results/<UTC-date>/<build-id>/result.json` names final Targets and every public
Author Output that actually completed on their route. Resource bytes are under that Result's `files/`;
Composite Value Documents are under `values/`; each document keeps canonical domain data separate
from its nested Resource-path bindings. `builds`, `history`, `inspect`, `get` and `build-record` use
the same repository interface. An active Build waiting for a detached Worker carries the exact repository
location it was given, so changing a Profile later cannot redirect that in-flight Build.

Author Graph and Run Graph remain compiler inputs. The Planner applies every `satisfy` globally,
computes the resulting dependency closure, and only then emits the immutable execution Definition:
selected initial Records, Producer steps, `Output -> Record` bindings, goals and Targets. Candidate
ids and the two source graphs do not enter Runtime persistence. Only zero-input Candidate sources
reached by that plan are then read, whether they name a local value, local file or historical Output.
A directly selected historical
Output gives Result storage one whole-Output forwarding address; historical inputs used inside a
new operation are staged once before the Build becomes active and produce ordinary current outputs.

The Result manifest itself may carry a human title, note and a list of highlighted public Outputs. Edit
those fields with `hypit result edit <build-id>`; this changes only that Build's `result.json`, does
not open the Runtime and does not create a project-wide metadata index. Studio reads the same fields
and can therefore show finished Builds even when no Runtime is selected.

`running` is neither a Result conclusion nor a persisted state. The stable Host `BuildView` derives
`submitting / ready / running / waiting / saving-result` from active facts. CLI and Studio consume that
view, never raw submission or execution persistence records. Once execution records its one `complete`, `failed` or
`cancelled` decision, a Worker can never claim it again. A Result has no `outcome` while accepting public
Outputs and is finished with exactly the same outcome. Result or cleanup failure adds independent
`attention = { step, error }` without changing the decision. Result browsing returns only finished
Results newest first, while an exact Build-id read can inspect a draft.

Every public Build id has the form `bld_YYYYMMDDTHHMMSSmmmZ_NNNNNNNNNN`. The UTC portion gives
Results a natural order; the final random nonce only prevents same-millisecond collisions and says
nothing about content equality or reuse. Pagination is keyset-based: `builds --before <build-id>` and
`history ... --before <build-id>` continue strictly before the last id returned.

For an S3-compatible repository:

```json
{
  "format": "hypit.build-results@1",
  "use": "@hypit/build-result-s3",
  "config": {
    "bucket": "my-video-results",
    "prefix": "projects/episode-12",
    "region": "us-east-1"
  }
}
```

The AWS SDK uses its normal credential chain. `endpoint` and `forcePathStyle` are available for
S3-compatible services. The prefix is the project boundary: each project should have its own
prefix. S3 changes only where complete Results live; it does not move Runtime SQLite, Provider capacity or
an active Build's temporary Resources into the bucket.

The S3 adapter maps each ordered Build id to a reversible newest-first physical prefix. It can request
one bounded delimiter page from object storage without a central index or duplicate catalog. Result
files are streamable by byte range, so
Studio video/audio requests do not load a whole remote file into memory first. `hypit doctor
[profile] --workspace <project>` actively checks the selected Result Repository as well as the Runtime;
the storage check performs only a bounded read-only listing and does not scan Result history.

The Workspace is resolved independently from the explicit `--workspace`, the project containing the
Runtime pointer, or the entry source directory. Runtime configuration cannot widen source access.

## Execution turns and concurrency

`build` commits a fresh Build and returns. SQLite durably records every Build that needs another turn;
the Worker materializes its state only while advancing it and writes accepted facts back immediately.
There is no Build concurrency setting and Build identity is not a capacity resource.

Each Endpoint instance is its own capacity pool by default. A Profile may give several Endpoint
instances the same `pool` only when they truly share one account, deployment or compute quota;
Endpoint packages may also apply a narrower exact-model limit. These are capacity claims, not queues.
Work from separate Builds shares only those exact resources. Each resource has one limit: an
immediate call releases its slot when it returns, while an asynchronous Operation keeps the same slot
until it becomes terminal. Unrelated Builds and Commands may advance together.

Cancellation is best effort. Work that has not begun is withdrawn; running work stops receiving
new commands and an Endpoint may try to cancel an already submitted external operation. The active
Build is still advanced once to write its Result, without running generation Commands.
Completed output is retained and never rolled back.

Asynchronous Operations are stored before Endpoint `start()`. Immediate Producers and Endpoints
store a live command receipt before invocation and the complete Core event after return. If only the
started state survives, that Build fails explicitly; the same command is never invoked again.

## Managed Programs

An Endpoint may declare a long-lived helper such as a warm local WhisperX service. The Endpoint owns
its probe and optional start command; the local Runtime only supervises it.

```bash
hypit programs status
hypit programs up
hypit programs down
```

`programs up` first prepares the selected Endpoint packages' upstream npm dependencies, then operates
their declared programs. The commands do not open SQLite or Credential Stores.

## Lifecycle

```bash
hypit runtime init
hypit runtime use hypit.runtime.json
hypit runtime up
hypit runtime status
hypit runtime logs
hypit runtime down
```

`runtime init` writes the video Distribution's starter Profile to `hypit.runtime.json` and selects
it for the resolved project. It refuses to overwrite an existing file. This is a local file operation:
it installs no package, contacts no service, requests no credential and starts no Worker. The official
starter selects HypiHub for remote generation, WhisperX, plus local media processing and
HyperFrames rendering. This is a Distribution default, not a Core rule; edit the Profile or select a
different one when using BYOK or local Providers.

`runtime use` binds one explicit Profile to one already resolved project. The project comes from
`--workspace`, or from the current directory's declared package boundary; the selection never
defines that boundary. Commands read only `<project>/.hypit/runtime`: they do not scan for a
conventionally named Profile and do not inherit a selection from a parent project. Separate projects
therefore select separately, even when their Profiles declare equivalent external Endpoints.

`runtime up` asks npm to prepare the selected adapters' exact upstream packages in the shared
machine home, prepares declared **local** Managed Programs, then starts the local Worker. It does not
start, restart, log into or probe remote Endpoints such as HypiHub. `runtime down` stops only the
local Worker; separately managed local Programs remain available until `programs down`.

`doctor` is the active read-only environment check. It resolves declared credentials and lets each
selected Endpoint verify its real environment; a remote Provider may therefore contact its bounded
catalog or capability endpoint. Login proves only that a credential exists, while a successful doctor
proves that the selected Endpoint's declared capabilities can be routed by that account at that moment.
Ordinary `check`, `plan` and Build preflight
never run these active probes and never turn environment inspection into a hidden network request.

`build` performs no provisioning: it runs cheap read-only preflight, submits work only when ready, and ensures the Worker
is available. `activity` and `cancel` observe or control active work. `status` reads Runtime and Result as
independent sources, so failure on one side neither invents nor hides facts on the other. Without a
Runtime, a finished Result proves only its own outcome.

If Result writing or active-state cleanup fails, the decision remains immutable and attention identifies
the exact `result` or `cleanup` step. After fixing the external problem, an operator may run
`hypit result finish <build-id>`. The one-shot Result writer uses only stored Build facts, finished
Operation values, working bytes and the exact Result Repository; it never loads or invokes a Producer
or Endpoint. It idempotently writes the Result, removes the working directory, then atomically removes
the active SQLite aggregate. Only one Result writer may own that work at a time; this mutual-
exclusion lease is not a phase and never changes the decision. A Worker restarted after a hard interruption
clears the abandoned lease and records attention, but performs no storage action automatically. Missing bytes
fail explicitly instead of being regenerated.
Reusing an earlier Result is an explicit Candidate in a new `.svrun`, not hidden Runtime behavior.

A running Worker loads installed Component packages as Builds first require them. A later Build may
name a new Component package without restarting the Worker; the Worker loads only packages it has
not already seen from that package's complete dependency closure. Loaded package code is not hot
reloaded, so editing a package or updating the Distribution still requires stopping an idle Worker
before the next Build.

The Worker records the normalized literal Runtime Profile, not a hash. A changed Profile is not
silently applied to a live Worker. SQLite separately pins credential and Endpoint selection while any
pending or active Build remains, so a restarted Worker cannot poll an old Operation handle through new
Endpoint config.

Runtime packages are trusted local deployment code. npm or pnpm owns their installed versions;
Hypit only selects exact requirements and invokes npm at the explicit `runtime up`/`packages install`
boundary. It has no second package lock and does not claim that metadata is a sandbox.
