# `@svml/video-cli`

Official v2 video command application. It selects the Text compiler Host, but deliberately carries
no built-in author, Run, Provider or Store package.

Every Frontend, Surface, deterministic Producer and Validator is activated from an explicit
`svml.packages.lock`. Installing a new author package therefore does not require a video CLI or Core
release. Source imports select logical author meaning only after the Host has reviewed and locked
the corresponding physical package. They never grant network, credential or process authority.

From the repository:

```bash
pnpm svml:v2 lock-packages ./svml.packages.lock \
  --package @svml/run-text --package @svml/script --package @example/cards --root .
pnpm svml:v2 lock-packages ./svml.runtime-packages.lock \
  --package @svml/provider-kie --package @svml/provider-media-local --root .
pnpm svml:v2 check path/to/main.svml --package-lock ./svml.packages.lock --root .
pnpm svml:v2 check path/to/build.svrun --package-lock ./svml.packages.lock --root .
pnpm svml:v2 plan path/to/build.svrun --package-lock ./svml.packages.lock --root .
pnpm svml:v2 build path/to/build.svrun --package-lock ./svml.packages.lock \
  --runtime ./svml.runtime.json --build-id delivery-01 --follow --root .
pnpm svml:v2 status <build-id> --runtime ./svml.runtime.json
pnpm svml:v2 builds --runtime ./svml.runtime.json
pnpm svml:v2 inspect <build-id> --runtime ./svml.runtime.json
pnpm svml:v2 get <build-id> --name final.video --runtime ./svml.runtime.json --to ./final.mp4
pnpm svml:v2 cancel <build-id> --runtime ./svml.runtime.json
pnpm svml:v2 doctor ./svml.runtime.json
pnpm svml:v2 gc ./svml.runtime.json
```

`check` is usable for an Author Source or a complete Run Source. `plan` and `build` require a Run
Source because an Author Graph without execution intent is not a Build. The live example executes
the explicit Vertex Gemini Caption package and real local/remote Endpoints; the CLI never
fabricates a Target, Candidate or missing fact.

`build` compiles the same locked BuildState and passes it to a trusted local Runtime Profile.
The default Build identity is content-derived, so the same invocation resumes durable local state;
`--build-id take-02` names an explicit take. JSON Profiles resolve only adapters in their separately
verified `runtimePackageLock` and contain no executable callback. The CLI imports no Provider;
loaded Runtime implementation identity is rebound to the actual package bytes. A TypeScript config
module remains trusted deployment code with normal Node authority. Neither form is discovered from
a source import.

Without `--follow`, a pending remote job returns `paused` and a later identical command resumes it.
With `--follow`, the CLI stays attached and follows endpoint `wakeAt` hints until completion, a
non-retryable failure, cancellation or `--max-wait-ms`. `status` reads durable verified state;
`cancel` invokes active endpoints and then records the resulting terminal Build failure. None of
these commands creates a second ready-command queue.

`build` archives every accepted Record in the demanded closure and every referenced byte Artifact,
whether or not the user wants a conventional filesystem copy. `inspect` lists Targets, demanded
Logical Outputs, accepted Records and their Artifact references. `get` reads one accepted Record;
without a selector it requires one distinct target, while `--name`, `--record` and `--output` select
a source output alias, accepted Record or demanded Logical Output. `--artifact` selects any nested
BlobRef that the Build actually references. `--to` copies an Artifact or writes an inline structured
value as JSON. It is Host egress only and never changes Build identity or retention.

`builds` and source aliases come from an optional Host `BuildCatalog`. The Catalog contains paths
and presentation names only. It is not Core truth or a Runtime Closure facet; `inspect` and `get`
always resolve the alias back through the verified BuildState before accepting it.

Historical Records, fixed files and generated previews are declared as ordinary Candidates in the
Run Source and selected by explicit Satisfaction edges. The Host verifies a referenced prior Build
only to extract the declared typed Record; it does not prove a semantic relationship with the current
output. Upstream work behind the selected Candidate is pruned by reverse reachability, while every
unbound reachable output follows the ordinary graph. This is a new Build identity and never resumes
or copies the prior Build's outstanding Commands.

`@svml/package-loader-node` supports explicitly trusted installed implementation packages. It
verifies the complete physical dependency closure before executing an activation entry, then checks
exact Module, Author/Run Frontend, Host-facet, Producer and Validator identities. The Loader does not
select a syntax; each Source Header selects among Frontends trusted by this Distribution and its
locked packages. Run Fragment libraries enter only through the `svml.run-fragment-host@1` facet.
`plan` and `build` bind the lock digest into `BuildRequest.implementationClosure`. Source cannot
install a package or activate Provider/Runtime authority. Arbitrary untrusted community execution
remains absent until an isolated Worker and real permission boundary exist.
