# Runtime Profile and capabilities

Read this when a project needs an execution environment, a credential, another Provider, or an
explanation of what the current machine can actually do.

[System relationships](../production/system.md) explains how authored work reaches these facilities;
[rendering](../production/rendering.md) explains picture, audio and frame-range requests.

## Start from the work's capabilities

The environment is sufficient relative to the work, not as a global state. Read the Brief,
Treatment, Source, and Run that matter, then identify the capabilities they need. A typical generated
reconstruction may need:

- word transcription and alignment through a selected `@hypit/whisperx` Endpoint;
- the exact image, video, voice, or audio models authored in Source;
- media inspection, normalization, extraction, audio assembly, and muxing;
- HyperFrames visual rendering;
- the project's selected Build Result repository.

Different work can need a smaller or larger set. Existing material with deterministic Caption, MG,
and editing does not acquire an image model merely because another production used one. Word
alignment establishes speech timing, and authored generation Needs require their selected
production capabilities. Local media inspection prepares reference frames and clips independently.

## Choose the practical capability path with the user

Read the project's relevant choices and inspect its tools, Profile, credentials and local preparation.
Keep a working setup the user has chosen. For a spoken reference, transcription may be the immediate
need while image and video requests are still taking shape. Explain the capabilities the piece will
need, and make the setup choice concrete through what is available, the preparation effort and cost.

`programs status` and `doctor` describe the selected Profile. A Profile containing only hosted
alignment leaves local WhisperX readiness unexamined. [Local tools](local-tools.md#assess-local-preparation)
explains where to inspect existing preparation and known service configuration.

- Recommend local WhisperX when the machine and preparation time make it practical. Its calls have
  no hosted Provider charge; first preparation may install a runtime and download model weights.
  [Local tools](local-tools.md#select-local-whisperx-explicitly) owns setup and repair guidance.
- Use a supported BYOK Provider when the user already has that account and wants to use it.
- Offer HypiHub when the user prefers one hosted account or wants an alternative to local preparation.
  It hosts WhisperX and supported image, video and audio models, so the same account can serve
  reference understanding and later generation. Check access for the capabilities this work needs.

When the path is undecided, share those findings, recommend a practical choice and ask which setup
suits the user. Their decision can cover the preparation as a whole. Record it in
[Brief](../creation/brief.md#brief-preserves-user-authority); the Profile implements that choice.
[Paid scope](../production/builds.md#work-within-the-agreed-paid-scope) explains how the commission
covers service charges. Prepare further model credentials as the creative plan needs them.

Switching from BYOK or local execution to HypiHub changes the selected service and may change the
billing account. That remains a user choice when the earlier route encounters authentication, quota,
rate-limit or service errors. An OAuth page follows the decision to connect the selected account.

## Create a Profile when the project needs one

From the project directory:

```bash
hypit runtime init
hypit paths
```

`runtime init` writes and selects an editable starter `hypit.runtime.json`. It preserves an existing
Profile and performs no installation or login. Use `hypit runtime use <profile>` to select an
intentional existing Profile for this project.

The official video Distribution's starter includes:

- `hypihub.default` for remote generation and WhisperX alignment;
- `media.local` for local media processing;
- `hyperframes.local` for local visual rendering.

These entries describe initial routing. Adapt them to the local and hosted services the user has
chosen. A missing credential on a starter entry describes that entry's readiness. The user's choice
is recorded in Brief; the actual setup may use BYOK, local WhisperX or another supported deployment.
Each authored model needs an Endpoint that supports its exact requested capability.

Runtime selection is project-local. Commands read that project's `.hypit/runtime` pointer and do not
choose a Profile from a familiar filename or from another project above it.

## Keep the owners separate

| Owner | What it decides |
| --- | --- |
| Author and Run Sources | what the work is and which public Outputs this execution requires |
| Runtime Profile | which environmental packages, Endpoint instances, credentials, and bindings are selected |
| Provider Endpoint | how one capability is supported, diagnosed, invoked, and priced |
| Credential Store | how one explicitly named secret is resolved |
| Managed Program | how a selected local Endpoint's long-lived helper is prepared and probed |
| Project Result repository | where finished Build Results and their public Outputs live |

Changing an Endpoint does not change the Author Source. Result storage is selected separately in
`hypit.results.json`; it is not a Runtime Profile field. Workspace and project-package resolution are
also independent of the Profile.

The Profile itself contains only environmental choices:

- `credentials` selects Credential Store adapters;
- `endpoints` names Provider adapter instances and their configuration;
- `bindings` chooses an Endpoint when several selected instances offer the same capability;
- an optional shared `pool` says that several instances consume one real account, deployment, or
  compute quota.

Read each selected Provider README for its accepted configuration and capability support. Installing
a package only makes it available; a Profile entry selects it.

## Connect Model, capability, Need and Endpoint

These names describe different facts about the same work:

| Term | Meaning in production |
| --- | --- |
| Model Package | Owns the authored request and result semantics, including the exact model choice and supported input form. It does not choose an account or service URL. |
| Capability | The versioned operation an implementation must support. Generation, rendering, media processing and alignment all have capabilities. |
| Need | One concrete external request produced by the selected graph, with its capability and actual inputs. One Build can produce many Needs. |
| Provider Package | Implements capabilities through a vendor API or local process, including credentials, invocation, polling, resource transfer, capacity and diagnostics. |
| Endpoint | One configured instance of that Provider, using a particular account or deployment. Several instances may use the same Provider package. |
| Binding | The Profile's explicit choice among Endpoints offering the same capability. |
| Runtime Worker | Advances submitted Builds, reserves shared capacity for their Needs and follows submitted external operations. |

For example, an authored video request determines what to generate. The Run can satisfy its output
with an existing Result so that generation is no longer demanded. If it remains demanded, the Model
produces a Need; the Profile resolves its capability to one Endpoint; the Provider maps that request
to the chosen service. The same author semantics can therefore work through BYOK or HypiHub when
both implement the exact capability, without putting those account choices into SVML.

A binding key is the complete `name@version#capability`, not a guessed vendor model label. For
example, this Profile fragment selects local alignment when multiple Endpoints offer it:

```json
"bindings": {
  "@hypit/whisperx@1#whisperx-alignment": "whisperx.local"
}
```

That Endpoint must actually be declared and support the capability. A single eligible Endpoint
needs no binding; multiple unbound choices are an error. Use the Model and Provider READMEs and
`plan` to establish actual support rather than inferring compatibility from similar model names.

## Set capacity at the resource it describes

The Runtime Worker and HyperFrames `workers` are different things. The Worker schedules many Builds;
HyperFrames workers are independent Chrome processes within one active render Need. There is no
per-Build worker count or extra Build-wide concurrency limit to coordinate all models.

| Control | What it limits |
| --- | --- |
| Endpoint total concurrency, commonly `config.defaultConcurrency` | Simultaneous requests across Builds using that resource |
| A Provider's exact-model limit, where supported | A narrower quota within its total capacity; read that Provider's accepted configuration |
| Endpoint `pool` | Shared resource identity for instances using the same real account, deployment or compute budget |
| Endpoint action limits, where supported | Concurrent `submit`, `poll` or `collect` calls and starts admitted within a time period; these are distinct from remote tasks in progress |
| HyperFrames `config.workers` | Chrome processes requested by one render; this is work size |
| HyperFrames `config.browserCapacity` | Chrome slots shared by render Needs; each reserves its actual worker count alongside one request slot |

For example, two local render Endpoint instances using 4 and 2 workers can share a pool with
request capacity 2 and browser capacity 6. Both fit together. With browser capacity 4, one waits;
a single request larger than the configured browser capacity is a configuration error. These are
illustrative budgets, not universal machine recommendations. Increasing workers can increase memory,
decode and I/O pressure; inspect actual progress before attributing every delay to capacity contention.
The selected frame range belongs to the render request, while worker policy belongs to the Endpoint.
Local HyperFrames holds both its request slot and browser units until the whole render Need finishes,
including preparation and encoding. The reserved units are a scheduling budget, not a live count of
currently open Chrome processes. Omitting `browserCapacity` leaves only the request limit.

Configure these choices in the Runtime Profile's Endpoint entries, using each Provider's documented
fields. All instances sharing a resource must agree on its limit; use different pools for genuinely
independent resources. Kie and HypiHub use the same capacity-reservation mechanism, but separate
accounts do not share a pool merely because they offer the same model.

Capacity reservations coordinate Builds sharing the same Runtime Execution Store. They are not a
cross-machine account quota service. An accepted asynchronous Operation retains its task-capacity claim
while it is pending, including between polls and across a Worker restart. Each short `submit`, `poll` or
`collect` call can separately consume action concurrency and rate; the call releases its concurrency when
it ends while a rate budget continues for its declared period. If an Endpoint action fails, that Operation
and Build attempt fail and their local capacity claims are released; any receipt, last remote status and
error remain evidence. Disconnecting a CLI observer does not change any of these facts. Studio's permitted
transient work has session-local concurrency and does not consume durable Build capacity claims.

Read the installed `@hypit/runtime-local` README for the shared model and the selected
`@hypit/provider-hyperframes-local`, `@hypit/provider-kie` or `@hypit/provider-hypihub` README for
accepted settings. Use `hypit activity` to inspect actual claims. After changing a Profile, follow
[Worker reload guidance](../production/builds.md#reload-changed-execution-code-deliberately).

## Put secrets behind credential references

A Profile names a Credential Store and key; the secret stays in that store. The writable OS store
uses macOS Keychain or Windows Credential Locker. The environment store reads one explicitly named
environment variable and is read-only.

Inspect one Endpoint's credential slots without revealing their values:

```bash
hypit auth status hypihub.default
```

Once the user has chosen to connect that account, use its declared acquisition flow or the selected
store's interactive input:

```bash
hypit auth login hypihub.default
```

For an OAuth Endpoint, this command opens the Provider's browser flow immediately. Another Endpoint
may securely prompt for its exact secret or accept `--from <secret-file>`. An Endpoint backed by the read-only environment store is configured
in the Worker process environment instead.

Keep secrets out of Author Sources, Runs, Runtime Profile JSON, project documentation, command
arguments, commits, and conversation text. Ask the user to complete a Provider browser flow or secure
terminal prompt rather than paste a key into chat. Report the Store, key name, Endpoint, and whether
it is configured; never report the stored value.

A stored credential proves only that a value is available. It does not prove that the account is
current, has quota, can reach a model, or is accepted by the remote service.

## Ask each command for the fact it owns

| Command | What it can establish |
| --- | --- |
| `hypit paths` | resolved project, selected Profile, and physical host/runtime locations |
| `hypit auth status <endpoint>` | whether that Endpoint's declared credential slots are configured |
| `hypit doctor` | an active, read-only audit of the selected or supplied Profile and Result repository |
| `hypit plan <run> --runtime <profile>` | the exact external Needs of one Run and cheap readiness of that demanded slice |
| `hypit runtime status` | Worker, active Build, and selected Managed Program state |

With no Profile selected or supplied, `doctor` checks the project Result repository alone. With a
Profile, it may authenticate and ask a remote Endpoint for its bounded capability catalogue. It
submits no generation request. A successful login followed by a failing doctor is useful evidence:
report the Provider's current explanation rather than treating credential storage as proof of
reachability.

`plan` knows the chosen Target and Candidates, so it identifies the capabilities this Run will demand
and applies the selected Endpoint's normal request-support check. Its preflight checks configuration,
credential presence, packages, executables, and relevant Managed Programs without actively probing a
remote service. Read `../production/builds.md` for planning, spending authority, and submission.

## Be honest about the available production

When a capability is unavailable, explain the part of the requested result that depends on it and
the practical choices available. Reference frames, supplied text and product material can still
support interpretation, Script and visual planning. Existing media can support composition with
HyperFrames MG, Caption and Typography when those serve the Brief. Generated performances and
measured speech timing depend on the corresponding capabilities becoming available. Keep the
completed work and the remaining dependency clear so the user can decide how to proceed.

When the user brings another model, service, or Key, use
[Models and Providers](model-and-provider.md) to distinguish credential setup, Endpoint configuration,
and a package extension. A project can install or author its own Provider or Model through the public
package APIs. The actual service protocol determines whether an existing Provider is reusable.

## Prepare the selected environment

After selecting or changing a Profile, `hypit runtime up` prepares the selected adapters' machine npm
dependencies, prepares and starts their declared local Managed Programs, validates the Runtime, and
starts its Worker. It does not log into or start remote services. `hypit doctor` is the active check
for those remote Endpoints.

Use `local-tools.md` when a selected local binary or Managed Program needs installation or repair.
Read `../production/builds.md` for how submission uses the prepared environment and Worker.
