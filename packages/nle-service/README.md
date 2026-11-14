# `@hypit/nle-service`

Transport-independent application service for one open `hypit.nle@1` Project and its sibling
`hypit.nle-view@1` Timeline View.

`NleService` is the single writer for both document owners during one open session. It owns revision
guards, Project history, View mutation, autosave, external-file conflicts, derived Timeline/Canvas/Inspector
projections, preview generations and bounded export/review Actions. It consumes one project-scoped Media Service;
it does not create a second Media catalog or watcher.

The package is not an HTTP server and contains no browser UI. Workbench HTTP/SSE, Desktop IPC and Agent Tools are
adapters over the same service. Product surfaces may expose a strict subset of the service's commands and semantic
capabilities without reducing the backend operation vocabulary.

`NleServiceOperations` is the shared typed application port: finite `observe`, `command` and `action` unions cover
structured state and work, while subscriptions and binary resources remain separate streaming/resource ports.
Adapters therefore do not call one another or turn a browser route into an Agent API.

`@hypit/nle` and `@hypit/nle-view` remain the owners of authored facts and transactions. `@hypit/nle-local` remains
the local preview/export executor. Temporary Programme resources, waveform/storyboard bytes and resource URLs are
application observations and never enter either authored document.

The complete operation inventory and invalidation rules are documented in [API.md](./API.md).
