# `@hypit/application`

`@hypit/application` supplies the long-lived ApplicationHost shared by Desktop, Agent, CLI and browser adapters.
It keeps one ProjectHost per canonical Project Boundary, gives each caller an explicit project lease, registers Product
Providers and owns Product Session lifetimes. Its Execution Directory opens project-scoped Executor clients from the
application's selected Execution Environments.

ApplicationHost owns runtime composition rather than author facts. Project Media remains owned by ProjectHost, owner
documents remain owned by their Services, and recoverable Actions and Publications remain owned by their selected
Execution Environments.

A Product Provider is registered once in an ApplicationHost because it is a session factory. For example, the
`hypit.nle-studio` provider can open any number of sessions against different ProjectHosts. NLE Projects, Views,
tracks and Items remain in those selected projects; the application registry retains only provider availability and
open session identity.

The finite application projection lists each registered product's stable identity and title. A bootstrap caller can
therefore present available products, lease a selected project and launch the chosen Product Session without importing
that product's implementation.

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
