---
title: Model and deployment services
description: Hosted model APIs, your own deployments, and independent service partners.
---

Choose the service that supplies the material your video needs. This choice is separate from
[where you run your Agent](./agents.md).

HypiHub is Hypit's recommended integrated hosted service for supported generation and WhisperX
work. Its Provider is maintained with Hypit. Local execution remains available through the local
Providers, and users can connect their own services through project Providers.

The services introduced below are independent partners. They have their own accounts, terms,
prices, model availability and APIs. A partnership is an introduction, not a shared HypiHub account.
The Distribution bundles an API-key Provider for each service named below; each Provider maps the
installed models that service offers and reports that service's input limits, and its README lists
both. A model the service offers beyond that set connects through the ordinary
[Model and Provider](./providers.md) extension path.

## Model and tool API partners

### TokenDance

[TokenDance](https://tokendance.space) is a multi-model gateway.
[`@hypit/provider-tokendance`](https://github.com/hypit-ai/hypit/blob/main/packages/provider-tokendance/README.md)
serves the Seedance 2.0 and 2.5 models, Seedream 5.0 lite and MiniMax H3 through the Ark and
MiniMax protocols TokenDance documents. Its
[documentation index](https://tokendance.space/llms.txt) and live model catalogue supply the
details of other models.

### HiAPI

[HiAPI](https://www.hiapi.ai) offers image, video and audio models through one asynchronous task
API. [`@hypit/provider-hiapi`](https://github.com/hypit-ai/hypit/blob/main/packages/provider-hiapi/README.md)
serves the Seedance, Seedream 5.0 lite, MiniMax H3, GPT Image 2, Nano Banana and Grok Imagine
models the Distribution describes. Its [model index](https://www.hiapi.ai/docs/models.json) lists
the rest.

### Pollo

[Pollo AI](https://docs.pollo.ai) offers video and image models through per-model generation
paths. [`@hypit/provider-pollo`](https://github.com/hypit-ai/hypit/blob/main/packages/provider-pollo/README.md)
serves MiniMax H3, Grok Imagine 1.5, GPT Image 2 and Nano Banana. Pollo takes reference media by
public URL only, so a request with reference media needs a URL the embedding caller supplies.

### BeatAPI

[BeatAPI](https://docs.beatapi.io/quick-guide) offers video and image models through one
asynchronous task API.
[`@hypit/provider-beatapi`](https://github.com/hypit-ai/hypit/blob/main/packages/provider-beatapi/README.md)
serves the Seedance 2.0 and 2.5 models, MiniMax H3, Grok Imagine 1.5, GPT Image 2 and Nano Banana,
and uploads reference media through BeatAPI's file endpoint. Its
[video](https://docs.beatapi.io/video-api) and [image](https://docs.beatapi.io/image-api) model
indexes list the rest.

### Monid

[Monid](https://monid.ai) is a Hypit service partner.
[Its documentation](https://monid.ai/docs) describes discovering tools, inspecting their inputs and
prices, and calling them through its interfaces.
[`@hypit/provider-monid`](https://github.com/hypit-ai/hypit/blob/main/packages/provider-monid/README.md)
serves the Seedance 2.0 and 2.5 endpoints, MiniMax H3 and the Wan 2.7 image models, and uploads
reference media through Monid's workspace file system. For another Monid tool, its
[HTTP API documentation](https://monid.ai/docs/api/overview) supplies the connection details, and
the Agent can implement the required request and result mapping in a project package.

## Your own model deployment

A deployment platform supplies somewhere to run a model. The resulting inference service connects
through the same Model–Provider–Endpoint relationship as a hosted model API. Reuse a Provider when
its full protocol matches, or implement that service's API in a project package. The chosen cloud
account owns compute and deployment costs; HypiHub credits do not pay for that deployment.

[Using your own deployment](./providers.md#use-your-own-model-deployment) explains what changes when
you own the serving environment. A deployment can be used without a partnership or an officially
bundled Provider.
