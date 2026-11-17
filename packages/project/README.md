# `@hypit/project`

`@hypit/project` opens one Hypit Project Boundary. It owns the Project manifest Reader, explicit package activation,
selected package catalog, typed owner-Service leases and the `ProjectHost` lifecycle.

The package does not interpret Media, NLE, Canvas or another owner's documents. `ProjectHost` shares one
`ProjectMediaService`, one `ProjectPackageEnvironment`, one capability-based resource gateway and one open-document
registry among product sessions. The
`node` entry reads the ordinary project directory and resolves only packages explicitly activated by
`hypit.project.json`.

`ProjectHost.observe()` provides the finite package, Media Catalog and document inventory projection.
`ProjectHost.subscribe()` reports Media Catalog generations and document lease changes for the open Project.

```ts
import { openNodeProjectHost } from "@hypit/project/node";

const project = await openNodeProjectHost({ root: "/work/documentary" });
const catalog = await project.media.observe();
const resource = await project.resources.openMedia(catalog.entries[0]!.reference);
await project.close();
```

Resource tokens contain no filesystem path. A trusted product adapter resolves a token only while serving its own
session, and revokes it when that session closes. The Node resolver canonicalizes the selected file inside the Project
Boundary before the gateway accepts it.

Package versions remain in `package.json` and `pnpm-lock.yaml`. An activated package exports a named `hypitPackage`
value from its Node-resolvable `./hypit` subpath. Package authors can construct that value with
`defineHypitPackage()`. A package may contribute several values of the same kind; the consuming owner interprets
their identities and contracts. Catalog offering ids are stable package-local author choices.
