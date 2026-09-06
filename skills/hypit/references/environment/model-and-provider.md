# Models, services, and Keys

Read this when the user wants a new model, another service for a familiar model, or a new account.
A Key identifies access to a service. The model describes what the work asks that service to produce.
Look at the existing Profile and the service's actual documentation before deciding what to change.

## Follow one request through the possible changes

Suppose the Source already asks GPT Image 2 to make a 9:16, 2K picture from a portrait and a Prompt.
The Model describes that request. The KIE Provider knows how to send it to KIE. An Endpoint such as
`kie.personal` configures that Provider for a particular account, deployment and capacity.

**The same service, a new Key.** If the existing account merely replaces its Key, update the value in
its Credential Store; the Endpoint can keep the same CredentialRef. To retain a personal account and
add a company account, create another credential entry and configured Endpoint, such as
`kie.company`. Both use the same Provider code. The Profile chooses the intended account.

**The same protocol, another address.** Reuse the Provider when its documented configuration accepts
the address and the deployment supports the full required protocol: authentication, reference upload,
submission, polling and result transfer. A similar URL shape or model label does not establish that.
For example, KIE's Provider exposes API and upload base URLs; the destination must actually support
the operations that this Provider performs.

**The same model, another service.** First look for an installed Provider for that service. KIE and
HypiHub both implement GPT Image 2, so an explicit switch between those implementations is a Profile
choice. A new service with a different API needs a Provider mapping if none already supports it.
That package translates the same model inputs into the service's fields, follows its tasks and stores
the returned media. The Model and the creative Prompt can remain unchanged. If the service offers
only a subset, such as 1K output, report the unsupported 2K request and resolve that production choice.

**A model Hypit does not yet describe.** Supply a Model definition for its actual text/media inputs,
parameters and result types, together with a Provider that implements its capability. An existing
Provider can be reused when it already supports that capability. One package may contain both Model
and Provider facets; a Provider can serve several models, and several Providers can serve one model.
A local deployment follows the same relationship, with a Managed Program when Hypit should prepare
and run its helper service.

The Agent establishes which service owns the Key, which model the user wants, and whether an existing
implementation can perform the actual request. Explain the resulting work in practical language:
“Your service offers the model we need. I'll check how it accepts reference images and returns results,
then connect your account to that implementation.” Use known account information and ask only for
missing facts or a choice that affects cost, privacy, setup or capability. Credential entry follows
`hypit auth` and the selected Store, keeping the secret out of Source and conversation.

## Keep the request and its execution separate

The Model owns author-visible meaning: exact model identity, text and media inputs, reference roles,
parameter values, and result types. It lowers Source into a Need with a versioned capability, a
concrete request, and an expected result type.

The Provider implements that capability through its service. It owns wire fields, URLs, uploads,
authentication, task handling, result transfer, service-specific support limits, capacity, diagnostics,
and its price source. Generated media returns as stored Resource references of the declared type.
The shared generated-media vocabulary carries text, media references, and image/video/audio results;
it does not choose a vendor or model on the author's behalf.

The Runtime Profile selects a configured Provider instance, called an Endpoint. A `binding` chooses
one when several Endpoints offer the same capability. The same Source can use another implementation
of that capability through an explicit Profile change. Different author inputs or model behavior may
instead require changing the Model and Source.

A service may expose only part of a model's supported range. Its Provider checks the complete request
through `supports` and reports unsupported combinations before submission. That service restriction
belongs to the Provider; it does not narrow the Model vocabulary for other implementations.

HypiHub participates in this same selection model. [Runtime Profile and capabilities](profile.md)
owns hosted, BYOK, local, account, and fallback choices.

## Extend through an ordinary project package

A custom Provider or Model can live in the project's `packages/` directory or arrive as an installed
package. Source selects Model contributions; the Runtime Profile selects Provider contributions by
`use`. The package's `hypit.activation` entry supplies the corresponding facets to those hosts.

The public APIs are supplied by the executable `hypit` Distribution:

| Import | Responsibility |
| --- | --- |
| `hypit/author-kit` | Author Module, Surface, component, and Fragment declarations |
| `hypit/model-kit` | Exact model requests and their Producer/Need construction |
| `hypit/generation` | Shared generated-media inputs, results, validation, and wire-mapping helpers |
| `hypit/endpoint-kit` | Capability handlers, credentials, receipts, and capacity declarations |
| `hypit/runtime-kit` | Profile-selected activation, configuration, diagnostics, and Managed Programs |

Each API's package README owns its exact fields and examples. Locate those files in the active
Distribution reported by `hypit paths`: `packages/model-kit/README.md`,
`packages/generation/README.md`, `packages/endpoint-kit/README.md`, and
`packages/runtime-kit/README.md`. They ship with the executable; a repository checkout is unnecessary.

Compile a TypeScript extension against the selected `hypit` development dependency and ship its
JavaScript and required assets. [Sharing a package](../production/component-sharing.md) explains direct
tarball handoff and registry releases. Creating an implementation of an existing public extension
point belongs in that package. Changing a shared port type, host protocol, or framework behavior is
a framework change and should be considered at that boundary.

## Establish that the connection works

Install the selected package, configure the Endpoint and credential reference, and use `doctor` to
inspect the selected deployment and its diagnostics. A Run's `plan` should identify the intended
capability, Endpoint, and price source, and accept the actual parameters and reference types needed
by this video. Read-only
checks establish configuration and declared support; a real media request needs the user's spending
authority and a result judged against the work.

A remote acknowledgement belongs to that submitted task. The Provider retains its non-secret receipt
and follows it through completion and collection. A failed attempt keeps the useful evidence and
Outputs; subsequent work selects them in a new Run. [Builds](../production/builds.md) explains this
execution model and its receipt handling.
