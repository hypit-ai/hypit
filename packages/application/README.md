# `@hypit/application`

`@hypit/application` supplies the long-lived ApplicationHost shared by Desktop, Agent, CLI and browser adapters.
It keeps one ProjectHost per canonical Project Boundary, gives each caller an explicit project lease, registers Product
Providers and owns Product Session lifetimes. Its AIGC Execution Directory opens project-scoped clients from the
application's selected Provider/model Execution Environments. Audiovisual, Scene, analysis and media Executors are
explicit dependencies of their owning Service or Product composition.

ApplicationHost owns runtime composition rather than author facts. Project Media remains owned by ProjectHost, owner
documents remain owned by their Services, and recoverable Capability Invocations and Publications remain owned by
their selected Execution Environments. Other Actions remain owned by their specialized Services or Executors.

A Product Provider is registered once in an ApplicationHost because it is a session factory. For example, the
`hypit.nle-studio` provider can open any number of sessions against different ProjectHosts. NLE Projects, Views,
tracks and Items remain in those selected projects; the application registry retains only provider availability and
open session identity.

The finite application projection lists each registered product's stable identity and title. A bootstrap caller can
therefore present available products, lease a selected project and launch the chosen Product Session without importing
that product's implementation.

`ApplicationHost.subscribe()` observes Project lease and Product Session changes. The loopback adapter exposes the
same notifications at `GET /api/application/events`. A Project lease addresses its finite projection and event stream
at `/api/application/project-leases/:lease` and `/api/application/project-leases/:lease/events`.

Launch a visual Product with `browser: true`. Its HTTP connections keep the Session active. On disconnect it has
one minute to reconnect. An unsaved document or active delivery can retain it until the work is resolved.
An HTTP server borrows an injected ApplicationHost by default. Its creator can transfer shutdown with
`closeApplication: true`.

```ts
import { openApplicationHost } from "@hypit/application";
import { createNodeApplicationProjectProvider } from "@hypit/application/node";

const application = openApplicationHost({
  projects: createNodeApplicationProjectProvider(),
  products: [],
});

const lease = await application.openProject({ root: "/work/documentary" });
await lease.close();
await application.close();
```
