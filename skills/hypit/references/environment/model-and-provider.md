# Models, services, and Keys

Read this when explaining what a production needs beyond the installed tools, when the user brings
a Key or chooses another service, or when a model is not yet available. Connecting a service through
a project package is ordinary production work, like making a project component. Hypit supplies the
extension interfaces; the production selects implementations.

## Separate the service choice from the way it is connected

**HypiHub names a service. BYOK (bring your own key) describes using an account the user supplies.**
They answer different questions. A HypiHub API key still connects HypiHub; another service's key
connects that service. OAuth and API keys are ways to authorize a connection, not different model
capabilities. There is no project-wide BYOK mode: the Profile can select different services for
different capabilities.

| Execution route | Account and charges | Connection work |
| --- | --- | --- |
| HypiHub, the recommended integrated hosted route | The user's HypiHub account and current rates | Use the bundled HypiHub Provider with OAuth or a HypiHub API key |
| A service the user brings | That service's account and rates | Use a compatible installed Provider, or implement the needed API in a project Provider |
| A model deployed on the user's chosen compute platform | The deployment account's compute and serving costs | Connect the deployed inference API through a compatible or project-written Provider |
| A chosen local model or service | Local preparation and compute; any model/service terms still apply | Use an appropriate local Provider, or implement the chosen local process |

Choose the useful execution route for the actual capability, then connect its account and select its
Endpoint. A missing credential, a missing API adapter and an unavailable model are different pieces
of work. A key can authorize an implemented API connection; it does not implement that connection.
HypiHub's maintained integration reduces connection work. Project Providers let the Agent connect
the services the user already has without waiting for official support.

Treat integration problems as solvable engineering work. Use service documentation, the installed
implementation and concrete request evidence to understand the failure and pursue a proportionate
solution for this production. A relevant
[published fix](distribution.md#check-and-update-the-relevant-installation) may help; configuration,
adapter changes or a focused code repair can also move the work forward. Explain material changes
and verify the intended behavior, keeping useful findings with the project. Official maintenance
should incorporate discovered fixes so other users need less repair work; the Agent's initiative
helps the current user and informs that improvement. Report what worked with the actual changes,
so success after a local repair remains distinguishable from the original release's behavior.

## Explain the connection in the user's terms

Relate the service to the result it enables: transcribing the reference, generating the requested
performance, or supplying another piece of material. Explain what already works and what this
connection adds. Use the information already supplied to make a recommendation; ask only for facts
or choices that remain unresolved. Describe a concrete outcome such as generating the presenter's
speaking footage, the useful service, and the remaining account or setup choice. The Agent owns API
research, package implementation and Profile wiring; the user need only supply missing service
information, secure access and consequential choices. The authoring vocabulary below helps you
implement that decision.

Hypit supplies the open-source framework and tools. Access to the Coding Agent and usage of image,
video, speech or other model services belong to their respective accounts and terms. Installing
Hypit adds no model credits. Check the access actually available to this Agent and project; a
subscription name alone does not establish which generation services it can invoke. Explain costs
from the selected route and actual work. Reusing an existing Output avoids
regenerating that material; new material still needs whatever execution and rates its Provider uses.

When the user brings a key, establish its issuing service and relevant API documentation or address
from the supplied information. HypiHub's website
creates credentials for HypiHub, not a place to import another service's Key. HypiHub itself can be
connected through its supported OAuth or API-key flow. Use the selected Endpoint's
[credential setup](profile.md#put-secrets-behind-credential-references) to store the secret and
connect its reference. Payment methods and account offers come from that service's current information.

## Know which fact is changing

A **Model** describes what to generate: exact model identity, text and media inputs, reference roles,
parameters and result types. It produces a Need for its versioned capability. A **Provider** fulfills
that request through a particular API or local process. An **Endpoint** configures a Provider for an
account or deployment. The Runtime Profile selects the Endpoint, using a binding when several
implement the same capability.

| Situation | Work to do |
| --- | --- |
| Replace a Key for the same account | Update its Credential Store entry; retain the Endpoint's reference |
| Add another account on that service | Configure another Endpoint using the same Provider |
| Use another address with the same complete protocol | Use the Provider's supported address configuration |
| Use the same model through a different API | Reuse an installed suitable Provider, or write a project Provider |
| Use a model not yet described | Add its Model definition and an implementation of its capability |

Similar model labels do not prove that uploads, input parameters, task handling or results match.
An "OpenAI-compatible" chat endpoint does not establish compatibility with the image, video,
reference-upload or asynchronous-job APIs this production needs. Changing `baseUrl` is appropriate
when that Provider's actual required protocol matches the selected service.
For an existing exact capability,
map the request in the Provider; keep the Model and creative prompt unchanged. Resolve a service's
unsupported combination explicitly, such as requesting 2K where it only offers 1K.

## Choose a service for the work

The official Distribution supplies local Providers and HypiHub. HypiHub is the recommended integrated
hosted route, maintained alongside Hypit's supported production capabilities, including WhisperX
and generation. It is a useful way to start when the user wants hosted execution without connecting
several services. Current availability, account requirements and rates still come from that service.
Match its current catalogue to the installed Model vocabulary and Provider support for the requested
inputs. A service can add a model before the installed Distribution describes it; that calls for a
Model and Provider extension or a release containing them. A missing model or unsupported parameter
is a capability question, while an expired credential is an account question.

A user's existing service or deployment remains a normal choice. Its Provider does not need to be
officially bundled. When an execution-service choice remains open, the maintained
[model and deployment service page](https://github.com/hypit-ai/hypit/blob/main/docs/guide/service-partners.md)
introduces independent partners and links their own documentation. Use an introduction when its
capabilities help this production. Partners have their own accounts, pricing and APIs; that page
names the partners whose Provider the Distribution bundles, and the others use the ordinary
project-extension path. Carry an already suitable, chosen service forward.

Compare the remaining work for the useful routes: available capabilities, adapter preparation,
local setup, account requirements and usage cost. A ready suitable connection can carry the work
forward. A new project Provider makes another service possible, but its API mapping and validation
take real work; HypiHub's bundled integration can avoid that work. Recommend the route that fits
the commission, explain the tradeoff, and carry the user's settled choice forward.

[Environment selection](profile.md#choose-the-practical-capability-path-with-the-user) owns readiness,
local preparation and account choices. Connect the capability needed next. For a spoken reference,
that may be WhisperX while the generation plan is still developing. Once the intended material is
clear, explain its required models and ask about an account only where that choice is unresolved.

## Use your own model deployment

A compute platform runs the model; its deployed inference API fulfills generation requests. The
Model describes the requested output, the Provider implements that API, and an Endpoint selects
the concrete deployment and credentials. Deployment location alone does not require another package:
reuse a Provider when its complete protocol matches; write a project Provider for a different API.

If the user has compute but no serving endpoint yet, deployment is the remaining preparation work.
Use the selected platform's current deployment documentation and the model's serving instructions
to establish a usable service, its persistence and its costs. A platform-management key may authorize
provisioning while inference uses separate access. Keep deployment preparation and lifetime distinct
from the individual generation requests sent to it; Runtime still owns Build execution through the
selected Endpoint. Once the service exists, the ordinary Provider implementation below applies.

## Implement the missing capability in the project

First inspect the selected model's vocabulary and README, then the service's actual API docs. Reuse
an installed compatible implementation when available. Otherwise create `packages/provider-…` in
the production, implementing the requests this work needs. The package may later be reused in other
projects under its owner's scope. Ordinary project extensions do not require a framework release.

Follow one concrete request through the service:

1. Name the Model's exact capability and expected result type. Identify scalar fields, text and
   media-reference roles in its request. A genuinely new model needs a Model definition as well.
2. Map those inputs to the API's fields and media transport. Declare `supports` for real service
   limits, considering authored inputs that are not yet produced. Support checks and pricing
   receive the request, not a graph to reverse-engineer. Determine what the request already tells
   you before uploading resources; a service's own capability query, where available, can add
   account-specific evidence without selecting a different request.
3. Resolve only the declared CredentialRefs. Return immediate results directly, or implement
   `start`, `poll` and, where useful, `collect` for acknowledged remote tasks. Record the received
   task ID promptly; let Runtime drive the lifecycle and retain it through interruptions.
   Use `reportProgress` for work inside a call, including reference preparation and collection;
   returned pending progress describes the acknowledged task between calls. Preserve the service's
   public failure reason and what was actually submitted, so the next decision rests on evidence.
4. Admit returned media through `context.resources` and return the declared result type. Declare
   capacity for the actual account/deployment. Supply the pricing page or `readPricing` material
   with units and conditions, without inventing a bill for unknown future inputs.
5. Compile and install the package, select its `use` in the Profile, and inspect `plan` and `pricing`
   for the actual Run. An authorized real request establishes live execution; read-only checks
   establish configuration and support without spending on a test generation.

The complete **project Provider example** ships in the Distribution at
`examples/provider-package/README.md`, with compilable source, activation and Profile configuration.
Locate it through `hypit paths`. Its unbranded example API is illustrative; use the selected service's
actual protocol. It demonstrates reference upload, receipt, polling, collection, limits and rates
without introducing a second scheduler. For a new Model, the Model SDK README includes the definition
and author-package activation example.

It ships two packages, and the request shape decides which one to follow: `provider-images` for a
generated image, `provider-videos` for a generated video. A video service usually receives a wider
reference vocabulary — images, videos, audio and first/last frames, each role mapping to its own wire
field — and returns its result through a separate `collect` step after `poll` reports the job ready.
A service that only supports part of the Model's declared range, such as fewer resolutions or a lower
maximum duration, reports that from `supports` so `plan` refuses the request with a reason; the shared
Model stays unchanged and the author's number is never silently narrowed.

## Use the public SDK

| Import | Responsibility |
| --- | --- |
| `@hypit/hypit/model-kit` | Exact model ports and Producer/Need construction |
| `@hypit/hypit/generation` | Generated-media values, validation and optional wire-mapping helpers |
| `@hypit/hypit/endpoint-kit` | Handlers, resource access, credentials, receipts, support and capacity |
| `@hypit/hypit/runtime-kit` | Profile activation, configuration, diagnostics and Managed Programs |
| `@hypit/hypit/author-kit` | Author Module, Surface and Fragment declarations for a new Model |

Each API's README in `packages/<name>/README.md` owns its exact interface and ships with the
executable. Use the active `@hypit/hypit` release as the extension's development dependency and ship
compiled JavaScript plus ordinary runtime dependencies. A repository checkout is unnecessary.
The package's `hypit.activation` exposes its facets; Source selects author contributions, while
Profile `use` selects execution contributions. Installing a package does not select its account.
[Package sharing](../production/component-sharing.md) explains tarballs and owner-managed releases.

Local inference follows the same model: implement the capability through the chosen local process.
Contribute a Managed Program when Hypit should prepare and operate a persistent helper. A Provider
owns its service mapping and diagnostics; it receives neither authority to change another account
nor a reason to alter the shared execution system.

Keep secrets in the selected Credential Store, and account/scope decisions in Brief. Report what
was connected and what remains needed in the user's language. [Builds](../production/builds.md)
owns spending scope, durable execution and reuse of produced Outputs.
