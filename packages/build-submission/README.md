# `@hypit/build-submission`

The narrow submission boundary shared by independently authored long-running Builds.

An authoring domain first prepares one finite `BuildDefinition` and its Runtime request. This package
then evaluates deterministic Producers, resolves the demanded Endpoints, runs Runtime preflight,
ensures execution is available and durably submits that exact request. It returns the command-scoped
Runtime and inspection used for submission so the caller may observe accepted work before closing them.

The package does not compile Source, lower a Generation Graph, mutate author files, browse Results,
select Runtime Profiles or implement a Worker. Those responsibilities remain with their owning domain
or application adapter. `createPublicBuildId()` assigns an execution identity at this boundary because
the identity belongs to one submission, not to an author document.
