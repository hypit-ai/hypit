---
title: Models and Providers
description: Choose an account, connect a service or add a model without changing the video execution system.
---

A **Model** defines what you ask to generate: its inputs, supported parameters and output type.
A **Provider** knows how to fulfill that request through a particular service. An **Endpoint** is a
configured instance of that Provider, with its service address, credential reference and capacity.
The Runtime Profile binds the requested capability to an Endpoint.

Hypit's official Distribution includes local Providers, the HypiHub Provider and the OrcaRouter
Provider. Other services connect through packages owned by the production or their authors. The Agent can implement a new
service through the public SDK, just as it can create a visual component for a video.
[Service partners](./service-partners.md) introduces independent partners through that same path.

## Choose the change that matches the need

| You want to… | Change |
| --- | --- |
| Use another key for the same service | The credential reference and selected Endpoint configuration |
| Use another compatible service address | The address or deployment options supported by the Provider |
| Use the same model through a different API | Install or write a Provider for that API and select its Endpoint |
| Use a model not yet defined | Add a Model package and a Provider that supports its request |

Two services offering the same model can have different request formats, limits or available
parameters. The Provider checks the request against that service's support and explains a mismatch.
A Profile chooses the route; an error on that route does not authorize spending through another account.

For an existing installation, inspect the selected Profile and credential status first. A starter
Profile supplies configuration examples; choose the services you want before connecting accounts or
preparing their dependencies. [Runs and Builds](../quickstart/run.md) shows the commands.

## OrcaRouter

[OrcaRouter](https://www.orcarouter.ai) is an OpenAI-compatible AI gateway: one endpoint serves the
models of many vendors, with adaptive routing, failover and gateway-level guardrails. Its Provider is
`@hypit/provider-orcarouter`, and it offers the `chat` capability against
`https://api.orcarouter.ai/v1`.

The Endpoint declares one credential slot with two explicit entry points. `OrcaRouter - API` takes an
`sk-orca-…` key the user already holds; `OrcaRouter - Auth` runs an OAuth 2.0 + PKCE authorization
that returns a key belonging to the same account. Both store an ordinary API key in the Credential
Store the Runtime Profile selects, and a key obtained either way reaches the relay the same way.

The model list is read from `GET /v1/models` with the configured key, so the models offered are the
ones that account may call. Nothing is inferred from a model's name: a chat control only offers
entries whose catalogue record declares a chat-capable endpoint type, and attaching images only
offers entries whose record declares image input. When the catalogue cannot be read, the panel keeps
a small verified fallback and says that it is degraded rather than showing an empty list.

A PKCE-issued key is durable, not a refreshable token: it is reused until the user revokes it at
`https://www.orcarouter.ai/console/authorized-apps`. A rejected key asks for a new authorization
instead of refreshing.

## Add a Model

Develop a project package against `@hypit/hypit/model-kit`, `@hypit/hypit/generation` and `@hypit/hypit/author-kit`.
Declare the exact request ports, parameter values, result type and capability. Its author Surface
connects prompt Text and reference media to the request, then publishes the resulting media as a
normal graph Output.

The [Model SDK](https://github.com/hypit-ai/hypit/blob/main/packages/model-kit/README.md) includes a
request definition and explains activation. The package owns the model interface; credentials and
HTTP mapping belong to the Provider.

## Add a Provider

Use the selected `@hypit/hypit` release as a development dependency and import the public SDK:

```ts
import { defineEndpointPackage } from "@hypit/hypit/endpoint-kit";
import type { AsyncEndpoint, CredentialRef, EndpointRequest } from "@hypit/hypit/endpoint-kit";
```

Implement the exact capabilities and result types the service supports. Map request ports to the
service API, resolve the declared credentials, and return its results. An immediate operation
returns directly; a remote task can submit an ID, poll for completion and collect the output files.
Concurrency and action limits belong to the Endpoint's resource declarations.

A genuine failure ends that execution attempt. Build Results preserve completed Outputs and public
task receipts. Further work uses a new Run and Build with suitable existing Outputs selected for reuse.

The [Endpoint SDK](https://github.com/hypit-ai/hypit/blob/main/packages/endpoint-kit/README.md)
owns the handler interfaces, activation, resource declarations and pricing API. Compile the package
to JavaScript and install it in the project through its package manager. Configure its Endpoint
under `endpoints` and select it in `bindings` in the [Runtime Profile](./runtime.md).

The [complete project Provider example](https://github.com/hypit-ai/hypit/tree/main/examples/provider-package)
demonstrates reference uploads, task receipts, collection and pricing using an illustrative API.
It also ships with the executable, so the Agent can adapt it without a repository checkout.

## Prices and permission

The Provider declares local work without a Provider charge, or supplies its published pricing page.
It can also read current rates using the Endpoint's credentials and return a concise summary with
the original pricing documents. `hypit pricing <run>` brings those rates together with the planned
requests. Pending media measurements remain unknown until the material exists.

Rates help explain the cost. The user's agreement supplies permission to spend through the selected
account for the agreed work and budget. That permission is separate from a successful login or an
available balance.
