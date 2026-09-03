# `@hypit/video-cli`

Official video command application. It selects the Markup compiler Host and supplies one editable
starter Runtime Profile. The CLI still imports no Provider or Store implementation; installed packages
are activated only by explicit Source imports or Profile `use` entries.

Every Frontend, Surface, deterministic Producer and Validator is activated from Source imports.
Installing a new author package therefore does not require a video CLI or Core release. Source
imports never grant network, credential or process authority.

From any project:

```bash
cd path/to/project
hypit runtime init
hypit auth login hypihub.default
hypit doctor
hypit runtime up
hypit check main.svml
hypit plan build.svrun
hypit build build.svrun --follow
hypit status <build-id> --watch
hypit activity
hypit builds
hypit history <source-output-name> [--source ./main.svml]
hypit inspect <build-id> [--output <source-output-name>]
hypit get <build-id> --output final.video --to ./final.mp4
hypit cancel <build-id>
hypit doctor
```

Creation-time tools run one immediate request through the selected Runtime Profile, with no Build,
Result or state. Each names the Endpoint and its price page before it runs, and writes exactly one
file the caller chose:

```bash
hypit observe <media…> --instruction <text|file> --prompt <text|file> --to notes/frame.md
hypit transcribe reference.mp4 --to notes/reference.transcript.json [--language en|zh|es]
hypit speak --text line.txt --voice "warm, unhurried" --to voice/intro.mp3
hypit measure main.svml --segment hook --language en --pace normal --min 4 --max 15 --rounding round
```

`observe` uses the Profile's Gemini Endpoint, `transcribe` its `whisperx-alignment` Endpoint (after
extracting 16 kHz mono speech audio with ffmpeg), `speak` its MiMo VoiceDesign Endpoint and reports
the audio's duration so the author can write it as a literal. `measure` counts a Segment's pronunciation
units at a delivery policy and prints the seconds to write as the literal `duration`; it opens no
Profile and spends nothing. `--runtime <profile>` names the Profile;
otherwise the project's `hypit runtime use` selection is read. Slow paid generation — pictures and
clips — is not a creation-time tool: declare it in the Source and go through `plan` and `build`.

Install the `hypit` Distribution globally once. It resolves its own TypeScript loader and CLI, so it
neither invokes npm per command nor requires a project to contain Hypit's `package.json`.

`--workspace` is only the Source Workspace containment boundary. `--asset-root` may additionally admit
explicit asset bytes without widening Source imports. `--package-root` is only the Host
override used to resolve installed packages. By default, a project with
`package.json` owns package resolution; a plain creative folder falls back to this Distribution's
installation. Keeping that separate from Source containment lets a video project live outside the
Distribution without weakening canonical-path source and asset boundaries. Runtime Profiles do not
contain either Workspace or package-installation overrides.

`check` is usable for an Author Source or a complete Run Source. `plan` and `build` require a Run
Source because an Author Graph without execution intent is not a Build. The live example executes
the Script-owned deterministic CaptionDocument alongside real local/remote Endpoints; the CLI never
fabricates a Target, Candidate or missing fact.

`build` compiles one immutable Build Definition and submits it to the configured Local Runtime with a
fresh, automatically assigned Build id. The id begins with its UTC creation time, so repository order is both
stable and visible; its random suffix prevents same-millisecond collisions and says nothing about content.
Source or Plan identity never reclaims an earlier Build; reuse
across Builds exists only through explicit Run Source Candidates. JSON Profiles resolve only adapters in their separately
selected `use` fields and contain no executable callback. The CLI imports no Provider. A TypeScript config
module remains trusted deployment code with normal Node authority. Neither form is discovered from
a source import.

Without `--follow`, `build` returns after durable submission and the detached Worker continues.
With `--follow`, the CLI observes Build activity and Operation facts until a Result outcome or
`--max-wait-ms`; Ctrl-C only detaches that observer. `status` reads durable verified state, and
`status --watch` reattaches the same kind of observer to an existing Build. The CLI
controls Builds, not individual Operations. Cancelling a Build atomically withdraws it before claim,
or marks running work for one best-effort Provider cancellation call after claim. It never selects
another Candidate. None of these commands creates or stores a ready-Command queue.

The Result saves every public Author Output completed on the demanded route, including structured
values such as semantic takes. Each Logical Output has exactly one public name in `publishedOutputs`;
there are no Record, Artifact or alias selectors. `inspect` shows those Outputs. `get` requires one
exact `--output` name and one explicit `--to` destination: a Scalar becomes a JSON file, a Resource
streams to one file, and a Composite becomes a self-contained directory with `value.json` plus every
referenced Resource. The destination must not already exist. This is Host egress only and never
changes Build identity or retention; large media does not need to be loaded into CLI memory.

`builds` and `history` browse project-owned Result manifests newest first. `--before <build-id>` moves
the cursor to older Results without a central history table. Presentation titles, notes and highlights
live in the Result manifest and may be edited without changing the Build id or the saved Outputs.
`history` always asks for one exact Output name; it never chooses a Result or writes reuse markup.
Use the returned Build id and Output name explicitly in a Run Source when reusing that value.

Human output is compact and organized around author-facing names. `--json` returns a stable, bounded
command view rather than Repository manifests or Runtime persistence objects. `--verbose` adds bounded
operational detail; physical state locations remain the job of `paths`, while `get --to` and
`runtime logs --verbose` expose the paths those commands explicitly operate on.

Historical Records, fixed files and generated previews are declared as ordinary Candidates in the
Run Source and selected by explicit Satisfaction edges. The Host verifies a referenced prior Build
only to extract the declared typed Record; it does not prove a semantic relationship with the current
output. Upstream work behind the selected Candidate is pruned by reverse reachability, while every
unbound reachable output follows the ordinary graph. This is a new Build identity and never resumes
or copies the prior Build's outstanding Commands.

`@hypit/package-loader-node` loads explicitly selected installed implementation packages and checks
their Module, Host-facet, Producer and Validator contributions. Frontends are ordinary
`hypit.source-frontend@1` Host facets, so the Loader does not
select a syntax; each Source Header selects among installed Frontends. Run Fragment libraries enter
only through the `hypit.run-fragment-host@1` facet. Source cannot
install a package or activate Provider/Runtime authority. Arbitrary untrusted community execution
remains absent until an isolated Worker and real permission boundary exist.
