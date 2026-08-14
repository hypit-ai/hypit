# `@narratage/video-cli`

Official video command application. It selects the Markup compiler Host, but deliberately carries
no built-in author, Run, Provider or Store package.

Every Frontend, Surface, deterministic Producer and Validator is activated from an explicit
`svml.packages.lock`. Installing a new author package therefore does not require a video CLI or Core
release. Source imports select logical author meaning only after the Host has reviewed and locked
the corresponding physical package. They never grant network, credential or process authority.

From the repository:

```bash
node --run narratage -- packages sync path/to/build.svrun \
  --runtime ./svml.runtime.json --root .
node --run narratage -- check path/to/main.svml --runtime ./svml.runtime.json --root .
node --run narratage -- plan path/to/build.svrun --runtime ./svml.runtime.json --root .
node --run narratage -- build path/to/build.svrun \
  --runtime ./svml.runtime.json --build-id delivery-01 --follow --root .
node --run narratage -- status <build-id> --runtime ./svml.runtime.json
node --run narratage -- builds --runtime ./svml.runtime.json
node --run narratage -- history [source-output-name] --runtime ./svml.runtime.json [--source ./main.svml]
node --run narratage -- inspect <build-id> --runtime ./svml.runtime.json
node --run narratage -- get <build-id> --name final.video --runtime ./svml.runtime.json --to ./final.mp4
node --run narratage -- cancel build <build-id> --runtime ./svml.runtime.json
node --run narratage -- cancel operation <operation-id> --runtime ./svml.runtime.json
node --run narratage -- doctor ./svml.runtime.json
node --run narratage -- gc ./svml.runtime.json
```

From a separate project directory during source development, run
`/path/to/narratage/narratage ...`. The Runtime Profile may point `packageRoot` at the checkout while the
root launcher resolves its own
installed TypeScript loader and CLI, so it neither invokes pnpm nor requires the current directory
to contain Narratage's `package.json`.

`--root` is only the Source Workspace containment boundary. `--asset-root` may additionally admit
explicit asset bytes without widening Source imports. `--package-root` is only the Host
override used to resolve the installed packages named by a lock; by default this Distribution uses
its own installation location. Keeping the two concepts separate lets a video project live outside
this checkout without weakening canonical-path source and asset containment. The official JSON Runtime Profile
has the same optional `packageRoot` override while retaining state and Artifacts under its own
`root`; the generic CLI does not infer that syntax from its suffix.

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

Without `--follow`, `build` returns after durable submission and the detached Worker continues.
With `--follow`, the CLI observes dispatch and Operation facts until terminal state or
`--max-wait-ms`; Ctrl-C only detaches that observer. `status` reads durable verified state. Scoped
Build/Operation cancellation records control separately from execution, continues reconciliation
after `accepted` or `unsupported`, and never selects another Candidate. None of these commands
creates or stores a ready-Command queue.

`build` archives every accepted Record in the demanded closure and every referenced byte Artifact,
whether or not the user wants a conventional filesystem copy. `inspect` lists Targets, demanded
Logical Outputs, accepted Records and their Artifact references. `get` reads one accepted Record;
without a selector it requires one distinct target, while `--name`, `--record` and `--output` select
a source output alias, accepted Record or demanded Logical Output. `--artifact` selects any nested
BlobRef that the Build actually references. `--to` copies an Artifact or writes an inline structured
value as JSON. It is Host egress only and never changes Build identity or retention.
Blob egress uses the Store's streaming facet, verifies the declared size and content digest while
writing a temporary file, then atomically replaces the requested destination. A large video is not
loaded into CLI memory and a corrupt stream cannot overwrite an existing export.

`builds` and source aliases come from an optional Host `BuildCatalog`. The Catalog contains paths
and presentation names only. It is not Core truth or a Runtime Closure facet; `inspect` and `get`
always resolve the alias back through the verified BuildState before accepting it.
`history` searches those frozen Catalog names across Builds, but reports only Logical Outputs whose
selected Record is present in verified BuildState. It neither infers renames nor lists unbuilt
aliases; an old Catalog name and a current output name are connected explicitly in the Run Source.

Historical Records, fixed files and generated previews are declared as ordinary Candidates in the
Run Source and selected by explicit Satisfaction edges. The Host verifies a referenced prior Build
only to extract the declared typed Record; it does not prove a semantic relationship with the current
output. Upstream work behind the selected Candidate is pruned by reverse reachability, while every
unbound reachable output follows the ordinary graph. This is a new Build identity and never resumes
or copies the prior Build's outstanding Commands.

`@narratage/package-loader-node` supports explicitly trusted installed implementation packages. It
verifies the complete physical dependency closure before executing an activation entry, then checks
exact Module, Host-facet, Producer and Validator identities. Frontends are ordinary
`svml.source-frontend@1` Host facets, so the Loader does not
select a syntax; each Source Header selects among Frontends trusted by this Distribution and its
locked packages. Run Fragment libraries enter only through the `svml.run-fragment-host@1` facet.
`plan` and `build` bind the lock digest into `BuildRequest.implementationClosure`. Source cannot
install a package or activate Provider/Runtime authority. Arbitrary untrusted community execution
remains absent until an isolated Worker and real permission boundary exist.
