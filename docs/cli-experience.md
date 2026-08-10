# Command-line experience

Status: first domain-neutral renderer slice implemented, 2026-08-10. `check`, `plan` and `doctor`
now have TTY/plain human rendering plus explicit `--json`; the remaining archive/Runtime commands,
interactive authentication and durable Worker views still follow this design. Worker execution is
specified in
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
- in-place refresh for `--watch`;
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
narratage status build-42 --json
narratage queue --watch --jsonl
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
narratage init
narratage check <source>
narratage plan <run-source>
narratage build <run-source> [--follow]
```

- `init` creates explicit project files from a selected installed template. It has no hidden video
  template in the generic CLI and no central package registry.
- `check` verifies one self-described Author or Run source.
- `plan` renders the frozen targets, Candidate choices and demanded graph without execution.
- `build` compiles, archives and dispatches. `--follow` observes; it does not own execution.

### 3.2 Build archive and execution

The existing short commands remain readable:

```text
narratage builds
narratage status <build-id> [--watch]
narratage inspect <build-id>
narratage operations <build-id>
narratage operation <operation-id>
narratage get <build-id> ...
narratage cancel build <build-id>
narratage cancel operation <operation-id>
```

Cancellation must always name its scope. The current bare `cancel <build-id>` is too ambiguous once
Operation control exists.

### 3.3 Runtime and maintenance

```text
narratage doctor <runtime-profile>
narratage runtime up|status|down|logs <runtime-profile>
narratage runtime service status|restart|logs <instance>
narratage queue [--watch]
narratage gc <runtime-profile> [--apply]
```

`doctor` is a familiar top-level read-only check. `runtime` owns live execution-domain lifecycle.
`service` remains a child noun for a real daemon. `gc` is explicit maintenance and keeps its dry-run
default.

### 3.4 Packages and authentication

Target commands:

```text
narratage packages lock <lock-file> --package <installed-name> ...
narratage auth status <endpoint-instance>
narratage auth login  <endpoint-instance>
narratage auth logout <endpoint-instance>
```

`lock-packages` can become `packages lock` before release. Installing npm packages remains the job
of npm, pnpm, Yarn or Bun; Narratage should not secretly invoke one package manager or maintain a
central package marketplace.

Authentication addresses the configured Endpoint instance, such as `kie.personal`, not a model
name such as Seedance. The same KIE credential may serve several model capabilities, while one model
may be available through several Provider instances.

## 4. Installation, initialization and login are different

These actions are often conflated but have different owners:

| Action | Owner | Current status |
|---|---|---|
| install the Narratage CLI/packages | ordinary JavaScript package manager | repository install works; no public release yet |
| initialize a project | CLI + explicitly selected installed template | not implemented |
| prepare local tools | selected Runtime adapters through `runtime up` | partially implemented as `services up`/postinstall |
| authenticate an Endpoint | Endpoint auth description + selected Credential Store | read-only environment and macOS Keychain Stores exist; interactive login does not |
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

KIE is currently an API-key case. Google Vertex may use Application Default Credentials or an
explicit JSON credential. AWS normally uses the SDK default credential chain or SSO. The generic
CLI must not contain a `switch (providerName)` for these differences.

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

Three current Runtime limitations must be removed before `auth login/logout` can be honest:

1. Endpoint config such as KIE currently accepts an environment-specific `apiKeyEnv`; it must accept
   an ordinary explicit `CredentialRef` instead of baking one Store into the Provider adapter.
2. the local Runtime currently selects exactly one Credential Store even though `CredentialRef`
   already contains a Store name; selected Stores must compose by that name and decline references
   addressed elsewhere;
3. the macOS Keychain package can read exact keys but cannot write or delete them through a bounded
   Runtime port.

These are Runtime/adapter changes, not Core or graph changes. Until they are implemented,
documentation should show environment injection or the bounded `security add-generic-password`
command rather than pretend login exists.

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
| complete/healthy/exact | `✓` | green |
| active/selected | `●` or `→` | cyan/brand accent |
| queued/waiting | `◷` | blue |
| warning/substitute | `!` | amber |
| failed/unavailable | `×` | red |
| cancelled/suppressed | `−` | dim neutral |
| remote Provider work | `↗` | magenta accent only where useful |

ASCII fallbacks are required. `exact` and `substitute` must always retain their words because color
cannot carry conformance.

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
Narratage  Build plan

  Run       delivery.svrun
  Targets   final.video
  Fidelity  exact

  18 operations
  ├─ 4  generation        KIE · Seedance Mini
  ├─ 7  media             local FFmpeg
  ├─ 1  alignment         WhisperX
  ├─ 1  caption planning  Vertex
  └─ 5  composition       HyperFrames + audio mux

  Candidates
  ✓ take-1.video   primary
  ! take-2.video   historical file · substitute

No external work was started.
```

Plan display is derived from the frozen plan and explicit Satisfaction edges. It never invents
estimated cost unless the exact Endpoint exposes a bounded price quotation.

### 6.3 Build submission

```text
✓ Build submitted

  Build     launch-2026-08-10-01
  Targets   final.video
  Runtime   studio-local
  Worker    ready · pid 48120
  Queue     position 2

Watch   narratage status launch-2026-08-10-01 --watch
Stop    narratage cancel build launch-2026-08-10-01
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

### 6.7 Cancellation confirmation

```text
Cancel Operation op_91ac?

  Build       launch-2026-08-10-01
  Endpoint    kie.personal
  State       pending · remote task 8f24…
  Impact      final.video and 6 downstream operations will remain unsatisfied
  Unrelated   2 operations may continue
  Stop        unsupported by this Endpoint

! The remote generation may continue and may still be billed.
  Its result will be retained but not accepted into this Build.

Continue? [y/N]
```

The prompt describes known facts and uncertainty. It never says “cancelled” before the Worker has
closed admission and the Endpoint outcome is known.

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
- `--quiet` emits only the requested result; `--verbose` reveals identities and closure details;
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
--interactive auto|always|never
--quiet
--verbose
--debug
--yes                   destructive/control commands only
```

`NO_COLOR` is honored. `--color always` may override terminal detection but never machine mode.

## 9. Implementation sequence

1. define versioned command result, progress event, diagnostic and action-hint shapes;
2. split current CLI handlers from `JSON.stringify` and raw `Error.message` output;
3. keep exact machine JSON behavior behind `--json` while adding TTY/plain renderers;
4. implement check, plan, doctor and existing archive commands first—no Worker dependency;
5. add Build/queue/Operation watch views with the durable dispatch work;
6. add explicit Build/Operation cancellation confirmation using the cancellation protocol;
7. replace Provider-specific `apiKeyEnv` config with explicit ordinary `CredentialRef`s;
8. compose selected Credential Stores by reference Store name;
9. add optional writable Credential Store facets and structured Endpoint auth descriptions;
10. implement `auth status/login/logout` without central Provider branches;
11. add `init` only after explicit project-template and public package distribution rules exist.

The visual renderer can therefore begin now. Installation shortcuts and interactive login are not
blockers for improving every existing command.

## 10. Acceptance laws

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
