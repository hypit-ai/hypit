# Command-line experience

Status: domain-neutral renderer, durable Runtime views and credential commands implemented,
2026-08-11. Commands produce one structured result rendered as TTY/plain or explicit JSON/JSONL.
Worker execution and cancellation laws are specified in
[`runtime-execution-control.md`](./runtime-execution-control.md).

## 1. Product principle

The CLI is not a debug wrapper around Runtime objects. For a developer it is the ordinary Narratage
product surface. It should make four things effortless:

1. understand what will happen before money is spent;
2. submit work without keeping one terminal alive;
3. see every Build, queue, Operation and external dependency honestly;
4. recover from an error using one concrete next action.

Visual quality does not mean printing a large logo or putting ANSI color around raw JSON. It means
stable information hierarchy, restrained typography, meaningful motion and no ambiguity between
author intent, Run realization and Runtime execution.

The generic `@narratage/cli` remains domain-neutral. A video Distribution supplies its name,
installed Frontends and locked packages; it does not fork the terminal renderer. Providers may
contribute structured authentication descriptions and diagnostics, but may not print directly to
the terminal.

## 2. Three output modes

Every command has one structured result and several renderings.

### 2.1 Human TTY

The default when stdout/stderr are attached to a terminal:

- color and Unicode when supported;
- compact tables, trees and key/value blocks;
- transient spinners only while an immediate operation is genuinely running;
- change-only durable rows for `--watch`; a future full-screen renderer may refresh in place;
- prompts only when stdin is interactive;
- paths relative to the project root where unambiguous;
- shortened digests with an explicit way to reveal/copy the full value.

### 2.2 Human plain

The default for a non-interactive terminal, redirected output or `NO_COLOR`:

- no cursor movement or animation;
- no meaning conveyed by color alone;
- one durable line per progress event;
- tables degrade into aligned or labelled rows;
- prompts fail with an actionable message rather than hanging.

### 2.3 Machine

Explicit rather than inferred:

```bash
narratage status build-42 --runtime ./svml.runtime.json --json
narratage queue --runtime ./svml.runtime.json --watch --jsonl
```

- `--json` emits one versioned JSON result to stdout;
- `--jsonl` emits one versioned event per line for a stream;
- stderr contains only a fatal launcher failure that prevented structured output;
- no ANSI, spinner, prose banner or secret ever contaminates stdout;
- field names and exit codes are compatibility surface; human wording is not.

For the first implemented slice, the former `JSON.stringify(...)` outputs are now reached through
the machine renderer rather than being the human interface.

## 3. Terminal grammar

The command vocabulary should stay small. Domain packages add capabilities and author syntax; they
do not add arbitrary top-level CLI verbs.

### 3.1 Authoring and compilation

```text
narratage check <source>
narratage plan <run-source>
narratage build <run-source> --runtime <runtime-profile> [--follow]
```

- `check` verifies one self-described Author or Run source.
- `plan` renders the frozen targets, Candidate choices and demanded graph without execution.
- `build` compiles, archives and dispatches. `--follow` observes; it does not own execution.

There is no `init` command in the current checkout. A future initializer must name an explicitly
installed template; the generic CLI will not gain a hidden video template or central package
registry.

### 3.2 Build archive and execution

The existing short commands remain readable:

```text
narratage builds --runtime <runtime-profile>
narratage history [source-output-name] --runtime <runtime-profile> [--source <author-source>]
narratage status <build-id> --runtime <runtime-profile>
narratage inspect <build-id> --runtime <runtime-profile>
narratage operations <build-id> --runtime <runtime-profile>
narratage operation <operation-id> --runtime <runtime-profile>
narratage get <build-id> --runtime <runtime-profile> ...
narratage cancel build <build-id> --runtime <runtime-profile>
narratage cancel operation <operation-id> --runtime <runtime-profile>
```

Cancellation always names its scope; the removed bare `cancel <build-id>` form cannot confuse Build
control with one Operation attempt.

### 3.3 Runtime and maintenance

```text
narratage doctor <runtime-profile>
narratage runtime up|status|down|logs <runtime-profile>
narratage services up|status|down <runtime-profile>
narratage queue --runtime <runtime-profile> [--watch]
narratage gc <runtime-profile> [--apply]
```

`doctor` is a familiar top-level read-only check. `runtime` owns live execution-domain lifecycle.
`services` is the narrower external-program-only lifecycle and never starts the Worker. `gc` is
explicit maintenance and keeps its dry-run default.

### 3.4 Packages and authentication

Current commands:

```text
narratage lock-packages <lock-file> --package <installed-name> ...
narratage lock-packages <lock-file> --add <installed-name> [--remove <selected-name>] ...
narratage lock-packages <lock-file> --remove <selected-name> ...
narratage lock-packages <lock-file> --refresh
narratage lock-packages <lock-file> --verify
narratage packages sync <run-source> --runtime <runtime-profile>
narratage auth status <endpoint-instance> --runtime <runtime-profile>
narratage auth login  <endpoint-instance> --runtime <runtime-profile>
narratage auth logout <endpoint-instance> --runtime <runtime-profile>
```

`lock-packages` can become `packages lock` before release. Installing npm packages remains the job
of npm, pnpm, Yarn or Bun; Narratage should not secretly invoke one package manager or maintain a
central package marketplace.

`packages sync` is the ordinary project-level trust action after imports, Runtime `use` entries, an
install or a source checkout changes. It derives Author roots from the Run/Author Source closure and
Runtime roots from the Profile, then writes the two exact locks declared by that Profile. It never
installs packages, scans a directory for guesses, activates Providers or rewrites source.
The lower-level `lock-packages` command remains available to package authors.

`--refresh` is the lower-level package-development operation for rebuilding one existing lock from
its authenticated `selected` list.

Repeated `--package` supplies the complete direct selection and therefore creates or replaces the
lock. `--add`/`--remove` edit an existing direct selection as one atomic operation; they do not
install packages. `--verify` authenticates the lock and compares its complete installed byte/facet
closure without writing. This keeps installation, local trust selection, and Runtime instance
configuration as three separate operations.

### 3.5 Full doctor versus one-Run preflight

`doctor <profile>` deliberately audits the complete configured deployment. It may therefore report
an unavailable WhisperX or Vertex Endpoint even when the next Run only draws local images. This is
not the right gate for a partial Build.

`plan <run> --runtime <profile>` derives the finite BuildPlan first, extracts its demanded capability
set, and diagnoses only Endpoints, credentials and external programs intersecting that set. The
result is printed with the plan and no external work is started. `build` performs the same scoped
preflight before constructing the execution Runtime, creating a durable Build, or issuing an
external request. The generic CLI compares capability references; it has no Provider-name switch or
central capability registry.

`check <run>` remains static. In particular, a future `<build-record>` Candidate can be checked
before its source Build exists. `plan` and `build` still require the exact archived value because a
deterministic execution graph cannot contain a placeholder historical Record.

Selection edits preserve the old trust boundary for every retained root. They reject changed or
newly reachable bytes below retained roots rather than laundering those changes into an unrelated
add/remove. Shared dependencies remain whenever another retained root still reaches them.

Authentication addresses the configured Endpoint instance, such as `kie.personal`, not a model
name such as Seedance. The same KIE credential may serve several model capabilities, while one model
may be available through several Provider instances.

## 4. Installation, initialization and login are different

These actions are often conflated but have different owners:

| Action | Owner | Current status |
|---|---|---|
| install the Narratage CLI/packages | ordinary JavaScript package manager | repository install works; no public release yet |
| initialize a project | CLI + explicitly selected installed template | not implemented |
| prepare local tools | selected Runtime adapters through `runtime up` | implemented; `services` remains the external-program-only view |
| authenticate an Endpoint | Endpoint auth description + selected Credential Store | generic status/login/logout implemented for writable Stores; environment injection remains read-only |
| provision cloud infrastructure | explicit Provider deployment tooling | separate and intentionally not part of login/runtime up |

Before publication, the honest repository onboarding remains `pnpm install` plus explicit lock and
Runtime Profile commands. A polished future install may be documented as npm/pnpm/Bun alternatives,
but the CLI cannot claim `npx narratage` or Homebrew installation until distributable packages and
binaries exist.

### 4.1 What `auth login` means

User-facing `login` is a single entry point, but the selected Endpoint declares the actual method:

- API key: securely prompt, then write one named secret;
- OAuth/device flow: open or display the exact Provider authorization flow and retain its token;
- external credential chain: invoke no login and explain the required external command/config;
- non-interactive deployment: reject prompting and name the required secret reference.

KIE is currently an API-key case. Google Vertex uses an explicit JSON CredentialRef. AWS normally
uses its SDK credential chain or SSO. The generic CLI contains no `switch (providerName)` for these
differences.

### 4.2 Decentralized auth contribution

A locked Runtime Adapter may expose a structured Host facet conceptually like:

```ts
type EndpointAuthDescription = {
  endpoint: string;
  methods: readonly (
    | { kind: "secret"; slots: readonly SecretPrompt[] }
    | { kind: "device-flow"; flow: DeviceFlowDescriptor }
    | { kind: "external"; instructions: readonly ActionHint[] }
  )[];
};
```

The CLI owns prompts, redaction, confirmation and rendering. The Provider owns the names and
requirements of its credential slots. The selected Credential Store optionally exposes bounded
`write` and `delete` facets; a read-only Store remains valid for servers that inject secrets.

This keeps authentication extensible without a central Provider registry. Merely installing a
Provider grants no credential authority; its locked Runtime facet and selected profile instance are
still required.

### 4.3 Secret UX laws

- secret input is masked and never echoed in a summary;
- paste is accepted without logging clipboard contents;
- success names the destination Store and slot, never the value;
- `logout` deletes only the exact selected slots after confirmation;
- `auth status` checks presence/validity without enumerating unrelated secrets;
- `--json` never contains a secret, even under `--debug`;
- CI never prompts and must use explicit CredentialRefs/environment injection.

These laws now execute through ordinary CredentialRefs, a composite of explicitly selected Stores,
and the optional bounded writable facet. Environment remains intentionally read-only; macOS
Keychain supports exact read/write/delete without giving Providers terminal or enumeration
authority.

## 5. Visual language

Narratage should feel calm and exact, not like a casino dashboard.

### 5.1 Brand treatment

- show the wordmark only for `--help`, `init` and an optional first-run welcome;
- never print a banner before every command;
- use one accent color for identity and selection, not rainbow output;
- use whitespace and alignment before boxes;
- reserve heavy panels for errors, destructive confirmation and final deliverables.

### 5.2 Semantic palette

Color is reinforcement, never the only signal:

| Meaning | Glyph | Color role |
|---|---|---|
| complete/healthy | `✓` | green |
| active/selected | `●` or `→` | cyan/brand accent |
| queued/waiting | `◷` | blue |
| warning | `!` | amber |
| failed/unavailable | `×` | red |
| cancelled/suppressed | `−` | dim neutral |
| remote Provider work | `↗` | magenta accent only where useful |

ASCII fallbacks are required. Color never carries information by itself.

### 5.3 Shared primitives

One internal terminal renderer should implement:

- heading and result summary;
- key/value facts;
- width-aware table with CJK/emoji-safe measurement;
- graph/tree outline;
- step list and progress event;
- status badge;
- warning/error/action panel;
- confirmation and secret prompt;
- stable truncation for paths, ids and digests;
- in-place watch region with a plain log fallback.

Packages and Providers return structured facts. They never import colors, table libraries or
`process.stdout`.

## 6. Example screens

These examples specify hierarchy, not exact ANSI escape codes.

### 6.1 Check

```text
✓ Source is valid

  Source      main.svml
  Frontend    @narratage/markup@1
  Modules     12
  Exports      3
  Assets       4

  final.video       svml.composition/RenderedVideo@1
  speech.program    svml.speech/Program@1
  captions.track    svml.visual-track/Track@1
```

The normal view does not print every digest. `--verbose` reveals closure identities; `--json`
returns the complete structured result.

### 6.2 Plan

```text
✓ Build plan is valid

  Run         delivery.svrun
  Targets     final.video
  Goals       1
  Steps       18
  External requests   5

Operations
   4  @studio/generation@1
   9  @studio/media@1
   5  @studio/composition@1

External requests
   4  @studio/generation@1#video
   1  @studio/media@1#speech-evidence

  These Needs may reach the Endpoints selected by the Runtime Profile during build.

Selections
  → take-2.video ← retained-take-2

No external work was started.
```

Plan display is derived from the frozen plan and explicit Satisfaction edges. Producer and Need
names come from the selected packages; output and Candidate labels come from the current Author and
Run sources. The CLI has no Provider/model registry and never classifies a request as paid by a
hard-coded list. It never invents estimated cost unless the exact Endpoint exposes a bounded price
quotation.

### 6.3 Build submission

```text
✓ Build submitted

  Build     launch-2026-08-10-01
  Targets   final.video
  Runtime   studio-local
  Worker    ready · pid 48120
  Queue     position 2

Watch   narratage queue --runtime ./svml.runtime.json --watch
Inspect narratage status launch-2026-08-10-01 --runtime ./svml.runtime.json
Stop    narratage cancel build launch-2026-08-10-01 --runtime ./svml.runtime.json
```

With `--follow`, the command transitions into the status view; it does not execute the Build inside
the observer process.

### 6.4 Queue watch

```text
Runtime studio-local  ● ready        Worker 1/1
Capacity              3/8 active     generation 2/2 in-flight

BUILD                     STATE       ACTIVE  WAITING  AGE
launch-2026-08-10-01      running          2        1  3m12s
product-stills-07         queued           0        0    18s
caption-revision-02       blocked          0        0     6s

Operations
↗ op_91ac  KIE Seedance       pending    next poll 8s
● op_3f28  local FFmpeg       running    00:04
! op_8d72  Vertex Caption     blocked    missing credential

q quit   enter inspect   c cancel   r refresh
```

Interactive keys are optional shortcuts over the same commands, not a hidden stateful UI. In a
pipe, the same watch emits durable lines or JSONL.

### 6.5 Doctor

```text
Narratage Doctor

✓ Profile          svml.runtime.json
✓ Package locks    author 31 · runtime 12
✓ Credentials      KIE · Vertex · AWS
✓ Tools            FFmpeg · OpenCV · HyperFrames browser
! Daemons          WhisperX is down
✓ Stores           SQLite · filesystem artifacts

Fix
  narratage runtime up ./svml.runtime.json

1 warning · 0 errors
```

Diagnostics are grouped by responsibility and deduplicated by root cause. An absent credential
should not produce five downstream stack traces.

### 6.6 Authentication

```text
Narratage Auth  kie.personal

  Method   API key
  Store    macOS Keychain · credentials.keychain
  Slot     KIE_API_KEY

? API key  ••••••••••••••••

✓ Credential saved
  narratage doctor ./svml.runtime.json
```

For an external credential chain:

```text
! aws.production uses the AWS default credential chain

No secret will be stored by Narratage.
Run the login required by your selected AWS profile, then verify with:
  narratage auth status aws.production
```

### 6.7 Cancellation request

```text
✓ Operation cancellation requested

  Operation  sha256:91ac…
  Build      launch-2026-08-10-01
  Execution  pending
  Control    requested
```

The command reports only the durable request. Later `operation` views distinguish `accepted`,
`confirmed`, `unsupported`, `too-late` and natural completion. It never says “cancelled” before a
remote terminal fact is known. Interactive impact confirmation is not implemented and therefore is
not part of the current safety claim.

### 6.8 Error

```text
× Build was not submitted

  RUNTIME_CREDENTIAL_MISSING
  Endpoint kie.personal requires KIE_API_KEY from credentials.keychain.

Fix
  narratage auth login kie.personal

Details
  svml.runtime.json:18

Run with --debug to include the internal stack trace.
```

Every user-facing error has:

1. one plain-language summary;
2. a stable diagnostic code;
3. the exact subject/location when known;
4. one or more structured repair actions;
5. a nonzero, documented exit code.

## 7. Progress and motion laws

- a spinner represents only a bounded immediate action, never a remote job that may take minutes;
- a recoverable remote Operation is a durable status row with elapsed time and next poll;
- progress percentages appear only when the Endpoint supplies a monotonic measured value;
- unknown progress says `pending`, never `99%`;
- elapsed time is not an ETA;
- provider cost is shown only from authoritative Provider data;
- terminal resize reflows; it must not duplicate hundreds of lines;
- `CI=1`, redirected streams and `--no-interactive` disable prompts and animation;
- `--verbose` reveals identities and closure details while the ordinary view stays bounded;
- `--debug` adds internal stack/context after redaction, never secrets.

## 8. Renderer architecture

Command handlers should stop writing text directly. They return structured results and progress
events:

```text
command handler
  ├─ result/event schema
  ├─ human terminal renderer
  ├─ human plain renderer
  └─ JSON / JSONL renderer
```

The renderer receives terminal capabilities and an injected clock. Tests snapshot semantic blocks,
not raw timing-dependent spinner frames. ANSI is tested separately. This keeps the command engine
embeddable and prevents video packages from affecting a non-video CLI's appearance.

Minimum common options:

```text
--json
--jsonl                 streaming commands only
--color auto|always|never
--verbose
--debug
```

`NO_COLOR` is honored. `--color always` may override terminal detection but never machine mode.
Authentication accepts `--from <file>` for non-interactive secret input; there is no hidden prompt
mode switch.

## 9. Command latency and package loading

The package manager is not part of Runtime execution. In this source checkout,
`node --run narratage -- <command>` uses Node's package-script runner and avoids starting pnpm for
every command; pnpm remains only the workspace installer/test runner. A published Distribution
exposes one compiled `narratage` executable.
Changing npm, pnpm, Yarn or Bun must not change Graph, Build or Runtime identity.

`status` is an observation, not a readiness gate. `runtime status` and `services status` return
success when the selected stores/services were queried successfully and expose readiness as a
separate `ready` field. `doctor`, `runtime up`, `services up` and `build` remain gates and return a
nonzero exit code when their requested outcome cannot be reached.

Cold command work is divided explicitly:

```text
CLI launch
  -> authenticate selected physical package bytes
  -> activate locked Frontends/components
  -> compile or open the selected Runtime stores
  -> perform the requested command
```

The loader hashes each physical package at most once per command and projects per-package closure
identities from that verified set. A JSON Runtime Profile is the single source for the Author lock
used by `check`, `plan` and `build`; repeating `--package-lock` is unnecessary and a conflicting
path is rejected. `check` and `plan` use a lazy archive view: merely naming the Profile does not
construct Providers or open Stores, and Stores open only if a Run actually references a historical
Build Candidate.
When the foreground compiler has already verified that lock, Runtime construction in the same
process reuses the loaded components and digest. A detached Worker is a separate trust process and
still verifies its own closure once when it starts.

Archive/control commands (`status`, `queue`, `builds`, `inspect`, `get`, cancellation and `gc`)
assemble only the durable Store control surface selected by the Profile. They do not construct
Seedance, Vertex, WhisperX, HyperFrames or other execution Endpoints. Provider credentials may be
absent while a developer inspects or exports already archived work.

Human `builds` inspects only the newest visible page instead of reading every historical
BuildState. JSON and verbose views remain complete. `history <output>` first filters the catalog's
declared aliases and opens only Builds that can contain that name. These are query projections over
package-owned facts, not caches or new identity rules.

Credential commands are narrower again: they construct only the named Endpoint declaration and
the explicitly selected CredentialStores. They do not open Build state, a Worker or unrelated
Endpoints. External-service preparation runs independent programs concurrently with explicit
human progress events; `--follow` and `queue --watch` emit only durable state changes rather than
silent waiting or unchanged one-second spam.

Remaining distribution work before public release:

- ship compiled JavaScript rather than starting the command engine through `tsx`;
- avoid treating large content-only libraries, notably the open-font catalog, as executable
  implementation dependencies when their selected bytes already enter the Source Graph as exact
  content-addressed Artifacts;
- add a long-lived compilation/watch mode only if normal cold commands remain perceptibly slow
  after compiled package distribution. Such a process may verify a lock once and must become stale
  when either the lock or installed implementation changes; a silent weak digest cache is not
  acceptable.

## 10. Implemented sequence

The structured renderer, archive commands, Runtime/queue/Operation views, scoped cancellation,
ordinary CredentialRefs, multi-Store composition, writable facets and generic auth commands are
implemented. `init` remains intentionally absent until explicit project-template and public package
distribution rules exist.

## 11. Acceptance laws

- every current command has readable TTY, plain and JSON output;
- JSON stdout contains no ANSI or progress prose;
- a redirected `--follow`/`--watch` never uses cursor control;
- narrow terminals and CJK/emoji labels do not corrupt tables;
- no package or Provider prints directly to stdout/stderr;
- errors contain stable codes and at least one actionable repair when known;
- interactive actions can be completed non-interactively with explicit flags/configuration;
- secrets never appear in snapshots, logs, debug output or JSON;
- cancellation wording matches factual control/execution state;
- another non-video Distribution reuses the same renderer unchanged.
