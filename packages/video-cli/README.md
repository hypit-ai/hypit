# `@narratage/video-cli`

Official video command application. It selects the Markup compiler Host, but deliberately carries
no built-in author, Run, Provider or Store package.

Every Frontend, Surface, deterministic Producer and Validator is activated from Source imports.
Installing a new author package therefore does not require a video CLI or Core release. Source
imports never grant network, credential or process authority.

From the repository:

```bash
cd path/to/project
narratage runtime use narratage.runtime.json
narratage check main.svml
narratage plan build.svrun
narratage build build.svrun --follow
narratage status <build-id> --watch
narratage builds
narratage history [source-output-name] [--source ./main.svml]
narratage inspect <build-id>
narratage get <build-id> --name final.video --to ./final.mp4
narratage cancel <build-id>
narratage doctor
narratage gc
```

Link the repository command once with `npm link`. It resolves its own TypeScript loader and CLI, so
it neither invokes pnpm per command nor requires a separate project to contain Narratage's
`package.json`.

`--workspace` is only the Source Workspace containment boundary. `--asset-root` may additionally admit
explicit asset bytes without widening Source imports. `--package-root` is only the Host
override used to resolve installed packages. By default, a project with
`package.json` owns package resolution; a plain creative folder falls back to this Distribution's
installation. Keeping that separate from Source containment lets a video project live outside this
checkout without weakening canonical-path source and asset boundaries. Runtime Profiles do not
contain either Workspace or package-installation overrides.

`check` is usable for an Author Source or a complete Run Source. `plan` and `build` require a Run
Source because an Author Graph without execution intent is not a Build. The live example executes
the explicit Vertex Gemini Caption package and real local/remote Endpoints; the CLI never
fabricates a Target, Candidate or missing fact.

`build` compiles the BuildState and passes it to the selected Runtime Profile with a fresh,
automatically assigned execution id. Source or Plan identity never reclaims an earlier Build; reuse
across Builds exists only through explicit Run Source Candidates. JSON Profiles resolve only adapters in their separately
selected `use` fields and contain no executable callback. The CLI imports no Provider. A TypeScript config
module remains trusted deployment code with normal Node authority. Neither form is discovered from
a source import.

Without `--follow`, `build` returns after durable submission and the detached Worker continues.
With `--follow`, the CLI observes dispatch and Operation facts until terminal state or
`--max-wait-ms`; Ctrl-C only detaches that observer. `status` reads durable verified state, and
`status --watch` reattaches the same kind of observer to an existing Build. The CLI
controls Builds, not individual Operations. Cancelling a Build atomically withdraws it before claim,
or closes admission and continues Provider cancellation reconciliation after claim. It never selects
another Candidate. None of these commands creates or stores a ready-Command queue.

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

`@narratage/package-loader-node` loads explicitly selected installed implementation packages and checks
their Module, Host-facet, Producer and Validator contributions. Frontends are ordinary
`narratage.source-frontend@1` Host facets, so the Loader does not
select a syntax; each Source Header selects among installed Frontends. Run Fragment libraries enter
only through the `narratage.run-fragment-host@1` facet. Source cannot
install a package or activate Provider/Runtime authority. Arbitrary untrusted community execution
remains absent until an isolated Worker and real permission boundary exist.
