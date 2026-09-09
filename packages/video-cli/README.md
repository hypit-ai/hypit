# `@hypit/video-cli`

Official video command application. It selects the Markup compiler Host and supplies one editable
starter Runtime Profile. The CLI still imports no Provider or Store implementation; installed packages
are activated only by explicit Source imports or Profile `use` entries.

Every Frontend, Surface, deterministic Producer and Validator is activated from Source imports.
Installing a new author package therefore does not require a video CLI or Core release. Source
imports never grant network, credential or process authority. A data-only package can also export a
reusable Source directly, for example
`<import as="ugc" source="@hypit/gpt-image-kits/phone-ugc-v1"/>`; resolving that Source does not
activate package code.

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

`transcribe` runs one immediate request through the selected Runtime Profile, with no Build,
Result or state. It names the Endpoint and its price page before it runs, and writes the transcript
to the chosen file. `measure` estimates a passage locally:

```bash
hypit transcribe reference.mp4 --to notes/reference.transcript.json [--language en|zh|es]
hypit measure main.svml --segment hook --language en --pace normal --rounding round
```

`transcribe` uses the Profile's `whisperx-alignment` Endpoint (after
extracting 16 kHz mono speech audio with ffmpeg). `measure` counts a Segment's pronunciation units at a
delivery policy and prints the seconds to write as the literal `duration`; it opens no Profile and
spends nothing. `--runtime <profile>` names the Profile; otherwise the project's `hypit runtime use`
selection is read. Anything the Author Graph declares as an output is a Build, however quickly it
comes back: pictures, clips and accepted voice references (`@hypit/mimo-speech`) carry the identity of the Source
that produced them, so they are declared in the Source and go through `plan` and `build`. To hear a
voice or learn a passage's real length before authoring the rest, build a Run whose target is that
speech output and reuse it as a Candidate.

Two more families are local, stateless and spend nothing. `hypit media` exposes the source at chosen
times and scales, and `hypit vocabulary`
prints what a Source may write:

```bash
hypit media probe reference.mp4
hypit media cut reference.mp4 --start 12 --end 19.5 --label-time --to notes/hook.mp4
hypit media frames reference.mp4 --at 12.4,13.1 --label-time --to notes/hook-frames
hypit media tile reference.mp4 --start 12 --end 19.5 --to notes/hook-grid.jpg
hypit media tile reference.mp4 --at 12.4,13.1,14.8 --columns 3 --to notes/exact-grid.jpg
hypit media tile reference.mp4 --start 12 --end 14 --every 0.1 --transcript notes/reference.transcript.json --to notes/detail.jpg
hypit media tiles reference.mp4 --around "your next idea" --transcript notes/reference.transcript.json --every 0.1 --columns 3 --rows 2 --to notes/phrase
hypit media tiles reference.mp4 --ranges notes/ranges.json --to notes/grids
hypit media boundaries reference.mp4
hypit media fetch https://… --to reference/source.mp4
hypit vocabulary
hypit vocabulary @hypit/media-pipeline --tag StillVideo
hypit vocabulary --visual text
```

`cut` isolates the requested interval and can visibly overlay source time on the evidence copy.
`frames` writes one JPEG per requested time, selecting the first decoded frame at or after it.
Visible frame labels use that frame's actual timestamp, as do the labels below each `tile` cell.
Sampling is shared by `frames`, `tile` and `tiles`:

- `--at` names exact sample times; `--start` and `--end` choose a range in seconds.
- `--every` samples from the start at that interval, excluding the end. Times use millisecond precision.
- Grids can instead use `--frames` evenly spaced bin midpoints. Without a sampling option they provide
  a compact overview; choose the interval explicitly when inspecting fast motion.
- `--transcript` reads `hypit.transcript@1` from `hypit transcribe`. The transcript and input media must
  share the same clock. Labels show source time, active words with their start/end, and nearby words.
  Active spans use `[start, end)`; overlapping words are all shown. Missing times stay missing, and a
  frame without a timed word is identified without inferring silence. Text is rendered below the
  source picture using Sharp/Pango and the machine's fonts, including font fallback for multilingual text.
- `--around "a phrase"` with `--transcript` selects that phrase's word boundaries plus `--padding`
  seconds on either side (0.3 by default), clipped to the input duration. Matching uses whole consecutive
  words, ignoring case, whitespace and punctuation. Repeated matches list their times and require an
  explicit `--occurrence` (one-based), or a numeric range. This locates evidence; it does not interpret it.
- `tiles` accepts the same selection as `tile`, or `--ranges` with a JSON array of
  `{ start, end, id?, frames?, every? }`. A range's sampling choice overrides the command default.
  It paginates into `--columns` × `--rows` cells (3 × 3 by default); the final page may have fewer cells.
  `--cell` chooses picture width. `tile` keeps all requested samples in one image.

`--json` reports each frame's `requestedAt` and actual `at`, plus its active/context words when supplied.
Grid `samples` retain the requested times; `frames` contain the actual extracted-frame information.
It also reports every page path for `tiles`. The media layer reads existing timed text; transcription
and its Endpoint remain separate. `boundaries` reports adjacent-frame
change candidates and their measured scores; it does not suppress short changes or call them shots.
`fetch` turns a link into a file with the pinned yt-dlp; [the downloader package](../yt-dlp/README.md)
owns its dependencies, download choices and file handling. Commands that create evidence write only
what `--to` names and refuse to overwrite. `vocabulary` reads the installed
manifests: every package with its tags and models, or one package's Surfaces with their attributes,
children and example, or the value shapes a drawing Producer must emit.

Install the `@hypit/hypit` Distribution globally once. It resolves its own TypeScript loader and CLI, so it
neither invokes npm per command nor requires a project to contain Hypit's `package.json`.

`hypit capture screenshot <url-or-file> --to <image>` saves browser material, and
`hypit capture run <script.mjs> [-- arguments]` runs ordinary project interactions with a prepared
Puppeteer page and screenshot/recording helpers. `hypit capture --help` lists viewport, region,
readiness and browser options. `hypit capture install-browser` prepares the package's tested browser
revision; an already installed compatible browser can be selected explicitly. The independently maintained `@hypit/browser-capture` package owns
browser lifecycle and capture; Video CLI owns command presentation. This preparation tool outputs
ordinary project files and opens no Runtime Profile or Build. The package README owns the script API.

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
