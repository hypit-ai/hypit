# `@hypit/hypit/runtime-kit`

Host facets for the two environmental choices a Local Runtime Profile may select:

* an Endpoint implements external capabilities;
* a Credential Store resolves explicit credential references.

External packages use this public subpath from their `@hypit/hypit` development dependency. The built
package's `hypit.activation` entry exports a default package contribution with
`format: "hypit.node-package@1"` and the declared `hostFacets`.

For a Provider, `createRuntimeEndpointAdapterFacet({ use, activate })` advertises its owner-scoped
package name. `activate(context)` reads `instance`, `pool`, and the package's own `config`, then
returns `{ endpoint }` from `defineEndpointPackage`; it can also return `program` and `diagnose`.
The configuration helpers parse values and CredentialRefs. Activation describes the deployment;
credential resolution, remote invocation, and Managed Program startup happen through their Runtime
operations. Installing the same package in another project preserves its `use` name.

```json
{
  "endpoints": {
    "art.personal": {
      "use": "@studio/provider-art",
      "config": { "apiKey": { "store": "file", "key": "art.personal" } }
    }
  }
}
```

This is a Profile fragment: the Provider defines its actual config fields, and the complete Profile
selects a Credential Store for `file` as well, such as `@hypit/credential-store-file` on any platform
or `@hypit/credential-store-os` where a macOS or Windows credential locker is available. Separate
instances can use separate accounts. A binding
names the chosen instance when several offer the same capability. The default pool identity is the
instance; declare a shared pool only for a real shared account, deployment, or compute quota.

Each adapter is addressed by its kind and `use` name. A package advertises that name through a Host
facet; the Runtime Profile selects it explicitly. Installing a package does not activate it.

Endpoint activation returns one Endpoint and may also describe a Managed Program such as a warm local
WhisperX process. Credential adapters validate configuration before opening a store. Active Resource
storage belongs to the Runtime implementation, while project Build Result repositories use the
separate `@hypit/build-result-kit` boundary. Runtime Kit knows no Provider, filesystem, database or
video package by name.

`ManagedProgram.installation.prepareBeforeStart` lets a Provider reconcile its installed environment
before a cold start, even when the installation probe already passes. The declared commands use the
Provider's ordinary package manager. A healthy running Program is reused before this preparation is
considered; Runtime does not inspect source files or infer implementation versions.
`ManagedProgramCommand.label` optionally names a command's purpose for progress and log headings.
It is display text supplied by the Program owner, not a phase to persist or interpret. Runtime
reports generic process/probe facts; the service itself owns domain-specific progress in its logs.
