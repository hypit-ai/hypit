# `@svml/cli`

Official v2 command-line assembly.

Unlike `@svml/compiler-node`, this application is allowed to choose a trusted default prelude. It
depends on the one ordinary `@svml/prelude-video` aggregate rather than importing each video package
itself. The current prelude contributes:

- the official Text Frontend;
- the Script raw Surface and its audiovisual Narrative contract dependency;
- the SVS alternate Frontend and generic Recipe manifest;
- the official Film and HyperFrames Render Structured Surfaces plus their exact static dependencies.

It does not place these packages in Core and does not grant source imports network, credential or
process permissions.

From the repository:

```bash
pnpm svml:v2 check path/to/main.svml
pnpm svml:v2 lock-packages ./svml.packages.lock --package @example/cards --root .
pnpm svml:v2 check path/to/main.svml --package-lock ./svml.packages.lock --root .
pnpm svml:v2 plan path/to/main.svml --target component.result
pnpm svml:v2 build path/to/main.svml --target component.result --runtime ./svml.runtime.ts
pnpm svml:v2 build path/to/main.svml --target component.result --runtime ./svml.runtime.ts --follow
pnpm svml:v2 status <build-id> --runtime ./svml.runtime.ts
pnpm svml:v2 cancel <build-id> --runtime ./svml.runtime.ts
```

`check` is usable for the implemented Script, Film, Render and recursively imported `.svs` sources.
`plan` is fully implemented by the generic Node compiler. A complete author video still awaits the
generation, Speech and Track Surfaces that produce Film's inputs; the CLI does not fabricate those
missing facts.

`build` compiles the same locked BuildState and passes it to a trusted local Runtime config module.
The default Build identity is content-derived, so the same invocation resumes durable local state;
`--build-id take-02` names an explicit take. The config module is deployment code with normal Node
authority. It is never discovered from a source import and should not be used for untrusted code.

Without `--follow`, a pending remote job returns `paused` and a later identical command resumes it.
With `--follow`, the CLI stays attached and follows endpoint `wakeAt` hints until completion, a
non-retryable failure, cancellation or `--max-wait-ms`. `status` reads durable verified state;
`cancel` invokes active endpoints and then records the resulting terminal Build failure. None of
these commands creates a second ready-command queue.

`@svml/package-loader-node` supports explicitly trusted installed implementation packages. It
verifies the complete physical dependency closure before executing an activation entry, then checks
exact Module, Frontend, Surface, Producer and Validator identities. `plan` and `build` bind the lock
digest into `BuildRequest.implementationClosure`. It never installs a package because source
requested it and does not activate Provider or privileged Runtime facets. Arbitrary untrusted
community execution remains absent until an isolated Worker and real permission boundary exist.
