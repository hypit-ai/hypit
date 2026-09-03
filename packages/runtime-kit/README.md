# `@hypit/runtime-kit`

Host facets for the two environmental choices a Local Runtime Profile may select:

* an Endpoint implements external capabilities;
* a Credential Store resolves explicit credential references.

Each adapter is addressed by its kind and `use` name. A package advertises that name through a Host
facet; the Runtime Profile selects it explicitly. Installing a package does not activate it.

Endpoint activation returns one Endpoint and may also describe a Managed Program such as a warm local
WhisperX process. Credential adapters validate configuration before opening a store. Active Resource
storage belongs to the Runtime implementation, while project Build Result repositories use the
separate `@hypit/build-result-kit` boundary. Runtime Kit knows no Provider, filesystem, database or
video package by name.
