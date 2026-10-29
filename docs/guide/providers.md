---
title: Models and Providers
description: Choose an account, connect a service or add a model without changing the video execution system.
---

A **Model** defines what you ask to generate: its inputs, supported parameters and output type.
A **Provider** knows how to fulfill that request through a particular service. An **Endpoint** is a
configured instance of that Provider, with its service address, credential reference and capacity.
The Runtime Profile binds the requested capability to an Endpoint.

The starter Profile includes local services and HypiHub. Other services connect through a Provider
package installed by the video project. Tell the Agent which service you want and provide its API
documentation; the Agent can install an available package or create a project Provider.
[Model and deployment services](./service-partners.md) introduces service choices. Choosing a service
is separate from [choosing an Agent environment](./agents.md).

HypiHub is the recommended integrated hosted service. **BYOK** means bringing an account's own
API key: the key connects to the service that issued it, through a compatible Provider. Tell the
Agent which service you already use and provide its API documentation; the Agent can handle the
connection and project package. A key authorizes requests but does not implement that API. One
project can use different services for different capabilities, with each service's own account
and charges.

## Choose the change that matches the need

| You want to… | Change |
| --- | --- |
| Use another key for the same service | The credential reference and selected Endpoint configuration |
| Use another compatible service address | The address or deployment options supported by the Provider |
| Run the model on your own cloud deployment | Prepare its inference service, then configure a compatible Provider or implement its API |
| Use the same model through a different API | Install or write a Provider for that API and select its Endpoint |
| Use a model not yet defined | Add a Model package and a Provider that supports its request |

Two services offering the same model can have different request formats, limits or available
parameters. The Provider checks the request against that service's support and explains a mismatch.
A Profile chooses the route; an error on that route does not authorize spending through another account.

For an existing installation, inspect the selected Profile and credential status first. A starter
Profile supplies configuration examples; choose the services you want before connecting accounts or
preparing their dependencies. [Invocations and Builds](../quickstart/run.md) shows the commands.

## Use your own model deployment

You can run a model on compute you control and connect the resulting inference service to Hypit.
The cloud platform provides deployment and compute; the Model defines the generation request;
the Provider implements the serving API; the Endpoint selects the deployed address and credentials.

An existing Provider can connect to a deployment with the same complete protocol. A different API
can use a project package such as `packages/provider-my-cloud/`. The serving protocol determines
that implementation boundary, rather than the cloud platform's brand. If the model is not already
described by Hypit, add its Model definition as well.

Preparing a deployment can involve model files, compute configuration and a serving process.
Your Agent can use the chosen platform's and model's instructions to establish that service, its
persistence and compute costs. Platform-management access and inference access may be separate.
Once available, the deployment receives ordinary requests through its Endpoint; provisioning a
deployment and executing a video Build have separate lifetimes.

## Add a Model

Create a project package when the service introduces a request shape that the installed Models do not
describe. Define the prompt, reference roles, supported choices and output media from the author's
point of view. The [Generation package README](https://github.com/hypit-ai/hypit/blob/main/packages/generation/README.md#model-contract)
provides the exact API and a package example for the selected release. Credentials and HTTP mapping
belong to the Provider.

## Add a Provider

Create a project Provider package to connect a selected Model to an API or local service. Implement
the request forms and limits that service actually supports, install the package with the project,
then configure it under `endpoints` and select it through `bindings` in the
[Runtime Profile](./runtime.md). The [Endpoint package README](https://github.com/hypit-ai/hypit/blob/main/packages/endpoint/README.md)
owns the exact TypeScript API and package fields.

The [complete project Provider example](https://github.com/hypit-ai/hypit/tree/main/examples/provider-package)
demonstrates reference uploads, task receipts, collection and pricing using an illustrative API.
It also ships with the executable, so the Agent can adapt it without a repository checkout. It holds
two packages: `provider-images` for a generated image, and `provider-videos` for a generated video
whose service receives the wider reference vocabulary — images, videos, audio and first/last frames —
and returns its result through a separate collection step.

Implement the capability that matches your service's request shape; a service that renders both
images and video can declare both capabilities in one package. A service often supports a narrower
range than the Model's vocabulary allows, such as fewer resolutions or a lower maximum duration.
That difference belongs to the Provider: report it from the capability's `supports` so `plan` refuses
the request with a reason, rather than editing the shared Model or silently narrowing the author's
request.

## Prices and permission

The Provider declares local work without a Provider charge, or supplies its published pricing page.
It can also read current rates using the Endpoint's credentials and return a concise summary with
the original pricing documents. `hypit pricing <source>` brings those rates together with the planned
requests. Pending media measurements remain unknown until the material exists.

Rates help explain the cost. The user's agreement supplies permission to spend through the selected
account for the agreed work and budget. That permission is separate from a successful login or an
available balance.
