# A project-owned Provider

This example shows a service that Hypit's official Distribution does not ship, implemented as a
project package through the public Hypit SDK. Two packages cover the two request shapes a service
usually differs on:

| Package | Model | Request | Lifecycle |
| --- | --- | --- | --- |
| `packages/provider-images` | `@hypit/gpt-image@1#gpt-image-2` | one image, optional references | asynchronous |
| `packages/provider-videos` | `@hypit/seedance@1#seedance-2-mini` | one video, references and frames | asynchronous |

Both service protocols are **illustrative**, not live vendor APIs. Replace the mapping and transport
with the selected service's documented operations. The lifecycle tests exercise the examples without
a paid request. Implement the capabilities needed by the production; a service's entire catalogue is
not required.

The video example is the one to read when the service renders **video**. A video request carries the
whole reference vocabulary — images, videos, audio and first/last frames — and the result is a large
remote task rather than a returned file. This is the shape most third-party video services use, and
the shape the official Distribution cannot supply for a service it does not know.

## Follow one request

The existing GPT Image 2 Model produces `@hypit/gpt-image@1#gpt-image-2` with a generated image-set
result. This Provider supports 1K at three ratios, with optional reference images. It reports its
smaller support range without changing the Model. The Profile selects this implementation; the
Source's prompt, references and model remain ordinary generation inputs.

The example service uses Bearer authentication for these API operations:

| Operation | Example protocol |
| --- | --- |
| Upload reference | `POST /uploads`, image bytes and media Content-Type → `{ "url": "https://…" }` |
| Submit generation | `POST /tasks`, `{ "model": "gpt-image-2", "input": { "prompt": "…", "ratio": "9:16", "size": "1K", "references": [] } }` → `{ "id": "task-123" }` |
| Poll task | `GET /tasks/task-123` → `state`: `queued`, `running`, `failed`, or `succeeded`; success includes a signed image `url` |
| Read rates | `GET /rates?model=gpt-image-2` → service-owned fields and a `description` stating rates, units and conditions |
| Collect result | GET the signed image URL without the account key |

HTTP failures expose a public `{ "error": { "code": "…", "message": "…" } }` and optional
`X-Request-Id`; failed tasks carry the same `error` object. The Provider preserves these fields,
the failed API operation or task ID, and omits unrelated response fields and signed URLs.
This example schema is not a universal service-error format: adapt the interpretation to the chosen API.

Known request limits and model identity are resolved before the media URL resolver can upload.
This service exposes no model-catalogue endpoint, so the example invents none. Services with a
documented query can use it before transferring references. Request preparation, submission and
collection report live activity through `reportProgress`; queued/running task responses supply
pending progress between calls. The Provider follows the selected mapping without substituting
another model or account after a failure.

`start` records the received task ID through `checkpoint` before returning it. Runtime owns polling,
capacity and durable operation state. `poll` returns `ready` for completed remote work; `collect`
stores the image through `context.resources` and returns the Model's declared value. The Provider
chooses neither a Result folder nor a project media path. A failed call ends the attempt while the
received task ID remains evidence. This service defines no cancellation endpoint, so the package
does not claim remote cancellation.

`pricing` identifies the service page. `readPricing` maps the current request to its service rate
source and preserves the response with a concise description. It reads no graph and invents no
future media duration. Rates and credentials do not supply spending permission.

## Follow a video request

A Seedance request reaches `@hypit/seedance@1#seedance-2-mini` and returns a generated video-set.
The Model declares the request; this Provider decides how the service receives it. Four things
differ from the image example, and each is the reason the video example exists.

**The reference vocabulary is wider, and each role maps to its own field.** The Model declares
`referenceImage`, `referenceVideo` and `referenceAudio` as separate ports precisely so each can map
to one wire field — a service that mixes them into one array cannot tell the roles apart. An image
reference also carries an optional `personReference` classification, which is why those ports use
`itemObject` rather than `urlArray`: the item field travels with the URL it belongs to.

```json
{ "references": [{ "url": "https://…/reference.png", "person": true }] }
```

`firstFrame` and `lastFrame` accept at most one item each, so they map with `url`, not `urlArray`.

**The service's range is narrower than the Model's, and the Provider states that.** Seedance 2 Mini
admits 480p/720p and 4–15 seconds; this illustrative service renders 720p up to 10 seconds. The
Model is not edited for that. `supports` reports the difference before submission, so `plan` refuses
the request with a reason instead of failing a paid job downstream:

```
This service renders at most 10 seconds, not 12
```

Do not widen the Model to fit one service. Do not silently clamp the author's number either — the
author wrote 12 seconds, and a 10-second result is a different video.

**Submission is an enqueue, not the render.** `start` returns as soon as the service acknowledges a
task, and the HTTP bound covers the API call, not the minutes the render may take. `poll` returns
`pending` while the task is `queued` or `running`, and the task id is checkpointed before `start`
returns, so an interrupted Build still names the remote work it began.

**The result is fetched in a separate `collect` step.** A finished task carries a signed URL; the
account key goes only to the service's own API. `collect` downloads the media, stores it through
`context.resources` and returns the Model's declared value. Because `poll` and `collect` are
separate actions, download capacity is configured independently of task capacity.

A task that reports `succeeded` without an output URL is a service contract violation, not a pending
job, and fails loudly. A `failed` task keeps the service's own error code and the received task id
as evidence, and redacts URLs from the message it republishes.

Every port the Model declares is mapped here, because `assertMappingCoversPorts` is what proves it:
a mapping that forgets a reference role or an item field fails at load rather than after a paid
generation returns the wrong video. Where a Model port is genuinely optional, `whenAbsent` states
what the service should receive when the author omits it — the service then gets the value the
author's request implies, not a field left to its own default. The lifecycle test asserts the
mapping against the Model's own port table.

## Make it a package in the production

Copy the package matching your service's request shape — `packages/provider-images` or
`packages/provider-videos` — into the video's `packages/`. Choose your own package name and change
`providerModule.name` with it. A service that renders both images and video can implement both
capabilities in one package; `defineEndpointPackage` accepts several. Implement the actual service
protocol, including its request limits, upload/download limits and any OAuth or cancellation
behavior it really offers. Configure the selected service address; `images.example` and
`videos.example` are placeholders that cannot generate media.

Use the active `@hypit/hypit` version as a development dependency. Build and install with the
project's package manager. In this repository the examples use `workspace:*` for that dependency;
replace it with your selected release when copying it out. The `@hypit/driver-node` and model
development dependencies (`@hypit/gpt-image`, `@hypit/seedance`) serve the repository tests only and
can be removed from the copied package. For example:

```bash
cd packages/provider-videos
npm install
npm run build
cd ../..
npm install ./packages/provider-videos
```

The package ships JavaScript. Its `hypit.activation` exports a Profile-selected Runtime facet;
installation alone activates nothing. The active Distribution resolves public SDK imports when
loading project packages. Keep the chosen package version and lockfile with the project.

Merge the endpoint, credential store and binding from `hypit.runtime.json` into the project's
chosen Profile. Preserve its other services and resolve bindings explicitly. Once the user chooses
that account, `hypit auth login videos.personal` securely enters the key into its declared store.
`plan` checks the requested parameters; `pricing` supplies the service's rates. Submitting a real
generation follows the agreed production scope and spending authority.

The service decides whether an Endpoint needs its own credential slot at all. A service that
authenticates through the platform it runs on, or one reached at a private address, may declare no
credentials or a non-secret account name; `defineEndpointPackage` takes whichever the service has.

## Owners

- `src/provider.ts`: exact capability, mapping, service support, task lifecycle, pricing and capacity.
- `src/activation.ts`: configuration and package activation through the Runtime SDK.
- Model: author inputs and result meaning. No service URL or account is placed in it.
- Runtime: durable execution, scheduling, credentials supplied to declared slots, and Results.

The Endpoint SDK README owns the precise handler fields; the Runtime SDK README owns activation.
Both are included in the installed Distribution. A new service may need a small immediate handler,
a different upload protocol, or an asynchronous implementation like this one. Those are Provider
decisions within the same public boundary.
