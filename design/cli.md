# Hypit CLI and shared Host operations

> Status: distribution contract for the `hypit` command and its current Host operations.

## Distribution and ownership

`@hypit/hypit` ships the `hypit` executable. It groups a finite set of commands in ordinary source modules
such as `project`, `nle`, `media`, `auth` and `execution`. Each command translates arguments into a typed
operation and presents its result. Project extensions run through their owner packages, npm scripts or
executables. Those programs can use the same typed APIs as the bundled commands.

The Node distribution assembles selected services and executors once at ApplicationHost startup.
`hypit host start` is the process entry for this assembly. The CLI uses the local Host client and the
published endpoint discovery. Help, version, and project bootstrapping use their own local operations.
Commands that need live services attach to the running Host or start the same distribution and then attach.
Concurrent starters converge on the advertised endpoint. The private endpoint record provides the loopback
credential to local clients. Startup output reports the endpoint location.

```text
hypit argv -> local Host API client -> authenticated loopback adapter
                                             |
Desktop, browser or Agent -> typed API -------+
                                             |
                                      ApplicationHost
                                /           |            \
                          ProjectHost   Product Session   Execution Environment
```

TypeScript callers with a trusted in-process Host use the same operation contract directly. The loopback adapter
decodes its wire input. Domain validation, revision checks and receipts are shared at the operation boundary. A CLI exit
releases its leases. Projects, owner Services and Actions keep the lifetimes assigned by their respective owners.
See [Host operation forms](host-backend-api.md#operation-forms).

## Command surface

| Command | Authority and result |
| --- | --- |
| `host status/start` | Local endpoint discovery and distribution startup. |
| `project inspect` | An existing ProjectHost's finite projection. |
| `auth status/login/logout` | Selected Environment's account connection. The host retains PKCE and credentials. The terminal can open the authorization URL and collect the copied callback proof. |
| `execution capabilities/doctor` | Selected Environment's enabled models and scoped readiness findings. |
| `execution quote <capability> --input <file>` | Account-specific estimate or pricing scheme for one declared request. |
| `execution submit <capability> --input <file>` | Start one recoverable Invocation and return its durable address. |
| `execution inspect/wait/cancel <invocation>` | Observe or act on the address in the selected Environment. The shell owns sequence and concurrency. |
| `execution publication <invocation>` | Read the completed Publication manifest. Reading a resource into a user-selected destination and adopting it into Project Media are explicit operations. |
| `nle open` | Open an NLE Studio Product Session on the running ApplicationHost and present its URL. |
| `nle inspect/export` | NLE snapshot or a Delivery Action with an explicit destination in the Project Boundary. |

Resolve a Project from an explicit path or the current directory only for operations that use one. An Execution
command selects a configured Environment by id. A Project command uses that Project's scoped client. Standalone
execution uses a deployment explicitly available to the local Application caller. An explicit Environment or
Endpoint selection has the same meaning in CLI and API.

`--input` accepts a JSON request file or stdin. The Model validates its own input, and the selected Endpoint
checks deployment constraints. References name explicitly supplied resources. Standard output carries the final
result, including structured failures in `--json` mode. Standard error carries progress and interactive prompts.
Stable identifiers, diagnostic codes and exit status support scripts. Interactive OAuth proof can be entered
without terminal echo. Watching a recoverable Invocation can end independently of cancelling it.
The local `--resources` file maps reference names to `{ "path": "...", "mediaType": "..." }`. Paths resolve
relative to that file. A quote can also use an explicitly supplied `durationSeconds` for a reference.

## Account diagnostics and quotation

`execution doctor` asks the selected Environment for a read-only check. The Environment reports deployment
selection and enabled Capabilities. HypiHub supplies account-specific findings by observing the credential slot
and, with an already valid credential, reading the model catalogue or one selected model offering. Missing
credentials, a credential that needs refresh, a rejected credential, an unreachable account service, and an
unavailable Capability are distinct outcomes. The check reads credential state without rotation and reports an
unattempted network check when usable credentials are unavailable. Credential interaction stays in `auth`.

`execution quote` shares Capability validation and Endpoint selection with `execution submit`. HypiHub
shares the request-to-model and operation mapping between its quote and submit paths, including variants that
use a different service model for text and edits. The quote uses known units and dimensions from this request,
its reference metadata and the selected model. If required billing inputs are available, it requests the
service estimate and returns its quoted units, currency or credits, and provider source. If a value such as
output token count is unavailable until execution, it returns the service's pricing scheme and identifies the
missing metering inputs. An unavailable price is a distinct result. The CLI formats the returned facts.

Quotation has its own short-lived execution entry. The selected connection handles normal token renewal.
Invocation admission, journals, staging and Provider uploads belong to `submit`. For multiple requests, the calling program invokes quote
explicitly for each one. Audio/video duration and other reference dimensions come from owner metadata or explicit
caller-supplied assumptions supported by the selected quote path.

## NLE through the same Host

A CLI command opens a lease on the same ProjectHost and selects the document by its project-relative path.
`nle open` launches a visual Product Session and transfers its lifetime to the opened Surface. Inspection and
delivery use bounded CLI leases.
Owner observations use the shared NLE Service. Commands with Product intent use the same typed operation
as Studio, since those operations already interpret View revisions, track guards, placement and trim rules.
A bounded NLE Product Session can serve these calls without opening a visual Surface. It need only hold the
document and action leases required by the command.

`nle inspect` can read the current shared revisions and projections. `nle export` selects a specific observed
Project revision, uses the existing Delivery Action, and keeps its lease through completion. The command
reports when its snapshot includes unsaved live edits. Editing commands need a revision-checked save
boundary before release. In particular, an edit initiated through CLI must not save another caller's drafts
as a side effect. The existing `operate` and `save` operations have separate lifetimes, so the first CLI
delivery slice focuses on observation and export.

## Further terminal operations

Canvas command design uses the same local Host. See [Canvas operations and CLI](canvas-api.md#cli-投影).

Project creation, Media import and single-frame review use the relevant Project, Media and NLE owner operations.
Publication resource export uses the Environment's typed resource access. Acceptance of an output into Media
remains a separate Project Action.
