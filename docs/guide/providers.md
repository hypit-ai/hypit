---
title: Models and Providers
description: Choose an account, connect a service or add a model without changing the video execution system.
---

# Models and Providers

A **Model** defines what you ask to generate: its inputs, supported parameters and output type.
A **Provider** knows how to fulfill that request through a particular service. An **Endpoint** is a
configured instance of that Provider, with its service address, credential reference and capacity.
The Runtime Profile binds the requested capability to an Endpoint.

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

## Prices and permission

The Provider declares local work without a Provider charge, or supplies its published pricing page.
It can also read current rates using the Endpoint's credentials and return a concise summary with
the original pricing documents. `hypit pricing <run>` brings those rates together with the planned
requests. Pending media measurements remain unknown until the material exists.

Rates help explain the cost. The user's agreement supplies permission to spend through the selected
account for the agreed work and budget. That permission is separate from a successful login or an
available balance.
