# `@svml/cli`

Official v2 command-line assembly.

Unlike `@svml/compiler-node`, this application is allowed to choose a trusted default prelude. It
depends on the one ordinary `@svml/prelude-video` aggregate rather than importing each video package
itself. The current prelude contributes:

- the official Text Frontend;
- the Script raw Surface and its audiovisual Narrative contract dependency;
- the SVS alternate Frontend and generic Recipe manifest;
- the official Speech, WhisperX, provider-free Caption, B-roll, Text, Film and HyperFrames Render
  Structured Surfaces plus their exact static dependencies.

It does not place these packages in Core and does not grant source imports network, credential or
process permissions.

From the repository:

```bash
pnpm svml:v2 check path/to/main.svml
pnpm svml:v2 lock-packages ./svml.packages.lock --package @example/cards --root .
pnpm svml:v2 check path/to/main.svml --package-lock ./svml.packages.lock --root .
pnpm svml:v2 plan path/to/main.svml --target component.result
pnpm svml:v2 check path/to/build.svrun
pnpm svml:v2 plan path/to/build.svrun
pnpm svml:v2 build path/to/build.svrun --runtime ./svml.runtime.json --build-id delivery-01 --follow
pnpm svml:v2 build path/to/main.svml --target final.video --runtime ./svml.runtime.ts --pin shot=<prior-build-id> --accept-substitute --build-id variant-01 --follow
pnpm svml:v2 status <build-id> --runtime ./svml.runtime.json
pnpm svml:v2 inspect <build-id> --runtime ./svml.runtime.json
pnpm svml:v2 get <build-id> --runtime ./svml.runtime.json --to ./final.mp4
pnpm svml:v2 cancel <build-id> --runtime ./svml.runtime.json
```

`check` is usable for the complete provider-free author graph in
`examples/talking-film-graph-check`. `plan` is fully implemented by the generic Node compiler. The
live example now executes the explicit Vertex Gemini Caption package and real local/remote
Endpoints; the CLI never fabricates missing facts.

`build` compiles the same locked BuildState and passes it to a trusted local Runtime Profile.
The default Build identity is content-derived, so the same invocation resumes durable local state;
`--build-id take-02` names an explicit take. JSON Profiles resolve only adapters registered by the
Host and contain no executable callback. A TypeScript config module remains trusted deployment code
with normal Node authority. Neither form is discovered from a source import.

Without `--follow`, a pending remote job returns `paused` and a later identical command resumes it.
With `--follow`, the CLI stays attached and follows endpoint `wakeAt` hints until completion, a
non-retryable failure, cancellation or `--max-wait-ms`. `status` reads durable verified state;
`cancel` invokes active endpoints and then records the resulting terminal Build failure. None of
these commands creates a second ready-command queue.

`build` archives every accepted Record in the demanded closure and every referenced byte Artifact,
whether or not the user wants a conventional filesystem copy. `inspect` lists Targets, demanded
Logical Outputs, accepted Records and their Artifact references. `get` reads one accepted Record;
without a selector it requires one distinct target, while `--record` and `--output` select any
accepted Record or demanded Logical Output. `--artifact` selects any nested BlobRef that the Build
actually references. `--to` copies an Artifact or writes an inline structured value as JSON. It is
Host egress only and never changes Build identity or retention.

`--pin output=<prior-build-id>` is temporary CLI compatibility language, not a Core primitive. The Host
verifies the prior Build only to extract a typed Record, attaches it as an ordinary zero-input
`substitute` Candidate, and adds an explicit Satisfaction to a newly compiled BuildRequest. It does not
prove that the old Graph, prompt or semantic meaning matches the current output. Consequently the
command requires `--accept-substitute`. Upstream work behind that selected Candidate is not
demanded, while every unbound reachable output follows the ordinary graph. The prior artifact must
still exist in the ArtifactStore selected by the Runtime. This is a new Build with a new identity;
it never resumes or copies the prior Build's outstanding Commands. `.svrun` is now the general Run
Graph, Target and Satisfaction language; this narrow flag remains only migration compatibility.

`@svml/package-loader-node` supports explicitly trusted installed implementation packages. It
verifies the complete physical dependency closure before executing an activation entry, then checks
exact Module, Frontend, Surface, Producer and Validator identities. `plan` and `build` bind the lock
digest into `BuildRequest.implementationClosure`. It never installs a package because source
requested it and does not activate Provider or privileged Runtime facets. Arbitrary untrusted
community execution remains absent until an isolated Worker and real permission boundary exist.
