# Planning, Builds, and Results

Read this when inspecting the work selected by an Invocation, obtaining spending authority, submitting a
Build, continuing after a failed attempt, following work after an observer disconnects, or retrieving
completed Outputs.

[Invocations](runs.md) owns Targets, transient overrides and their optional saved form. [System relationships](system.md)
explains how the authored production becomes a Build, and [rendering](rendering.md) covers whole or partial video outputs.

## Reuse available Outputs and identify active Builds

For a revision, identify the relevant Invocation and its completed Outputs. Export still-useful media into
the project and record the durable choice in the Author Source. [Authoring](authoring.md#reuse-produced-work-explicitly)
explains how project material and realization selection preserve media without freezing downstream edits.
A failed Build can still contain completed Outputs; a missing exported file is not evidence of missing media.

If the CLI or observation tool loses its reply while submitting or following a Build, inspect the
local Runtime and project Results: the Worker may already be executing that Build.

```bash
hypit activity
hypit status <build-id>
hypit builds
hypit inspect <build-id>
```

Use the original project and Runtime Profile for activity, status and cancellation; pass
`--runtime <profile>` when it is not the project's selected Profile. `builds` and `inspect` read
project-owned Results without a Runtime argument. Read active execution from the Runtime Profile
that received the Build.

Use the known Build id. If it was not returned, use project activity and Results to identify the
submission from its Invocation Source when saved, Author Source and submission time. Follow active work with `status --watch` and
inspect or export completed Outputs. A closed terminal or interrupted
observation is distinct from a failed Provider request inside the Build. Finishing an incomplete
Result is covered below and does not require regenerating media.

Follow-up commands printed by the CLI retain the project and relevant Runtime. Preserve that scope
when adapting a command. Watching with `--json` still reports coalesced progress on stderr while
stdout carries the final JSON; read both channels when the terminal tool exposes them. Translate the
reported work, relevant uncertainty and useful next action into a concise update for the user.
The Runtime owns execution; a conversational update or a detached observer does not pause it.

For a slow or failed stage, read its retained execution evidence:

```bash
hypit logs <build-id> --lines 80
```

This reads Provider diagnostics and execution phases from active work or the finished Result.
Completed Build logs remain accessible through the Result repository without the original Runtime.
Use `hypit runtime logs` for Worker startup or process failures. Start with the relevant tail and
expand it when the cause needs earlier context; a closed terminal does not erase the Build's log.

## Continue after a failed attempt

A failed Build leaves the work and evidence produced by that attempt. Export any accepted file into
the project, declare it in Source and update its realization selection, then submit a
new Build for the remaining work. The earlier Build retains its failure.

When a Provider task-submission request times out without a task ID or another usable receipt,
the Result can establish the request failure and absence of a receipt, while the remote outcome remains
unknown. A later submission is a new Build. Assess its paid requests against the
[agreed scope and cost](#work-within-the-agreed-paid-scope), and carry any accepted files into the
project before the next attempt.

When a usable receipt does exist and gives access to a generated asset, the Agent can retrieve that
asset as an ordinary project file and declare it in the Author Source. Downstream preparation and
alignment then run from that authored material when needed.

Use `status <build-id> --verbose` for task IDs, Endpoints and progress. Use
`inspect <build-id> --verbose --json` for the Result's full retained execution records, including
Endpoint identities and available receipts; increase `--limit` if the report lists omitted records.
Secret values stay in their Credential Store. `--json` changes encoding, while `--verbose` requests
these details.

## Plan the selected Invocation

`hypit plan` inspects one explicit Invocation's execution demands. The creative direction shared with the
user develops earlier from their request and reference evidence; it does not require a saved Invocation, a fully
prepared environment or this command. Use the command when there is concrete execution to inspect.

Plan the actual Invocation after durable material choices are in the Author Source and requested execution
choices are expressed:

```bash
hypit check path/to/main.svml
hypit plan path/to/main.svml --target final.video
```

`check` validates the self-described Sources and graph without executing them. `plan` freezes the
demanded subgraph after applying authored realization choices and Invocation overrides, then lists
every external Need that would be sent. Planning starts no external work.

Use the default reports to follow the remaining work. `--json` changes the encoding; `--verbose`
expands the scope. Read demanded Needs to decide what will execute, and `pricing` to identify the
subset that may incur a Provider charge.

With a selected Runtime Profile, the plan also names the Endpoint behind each request, applies that
Endpoint's request-support rules, checks cheap readiness for the demanded capabilities, and shows the
Provider's declared price page or that its price source is unknown. Planning remains local and does
not require a billing account to answer.

Read the current pricing material selected Providers expose for these same Needs:

```bash
hypit pricing path/to/main.svml --target final.video
```

`pricing` is an explicit read-only network operation. It creates no Build and submits no generation.
The default report groups matching requests by their selected Endpoint and pricing material, showing
known parameters, request counts, and the Provider's rate summary or document with its source URL. Explicit
no-charge work is summarized in one count. Missing pricing declarations and failed queries stay visible.
Use the stated units and conditions together with authored duration, resolution, count, or other
billing facts to calculate and explain the expected cost. Providers may publish several price tiers
for one model; match the request to the applicable conditions. A future audio input may not have a
known duration yet. Use its per-audio-second rate with an explicitly estimated length from the
production plan, keeping that estimate distinct from measured usage. Hypit itself calculates no total.

`--json` puts each group's `requests` beside its `pricingDocuments`, retaining the Provider's original
data. Both views include all pricing groups by default. `--limit <count>` shortens only the human
view; `--verbose` shows original documents and the no-charge work. Read the relevant groups and explain
the expected cost of the described work, the account that would pay and any material uncertainty.

Read the remaining Needs against this change. A Caption or MG-only revision should retain its accepted
media realization; replacing selected B-roll should leave the unchanged performance selected.
Rendering and other required processing may still appear as Needs. Explain each new media request
from the user's goal or an explicit generation decision. If a request appears because an accepted
project realization is missing, repair the Author Source and plan again before asking to spend or submitting work.

## Work within the agreed paid scope

Spending authority covers a described piece of work through the selected billing accounts and the
cost or budget the user accepts. Explain those terms before asking for authorization, using the
available Provider rates and the work's expected usage. Give an estimate at the precision the current
plan supports, with material uncertainty visible. Account access and available quota describe what
can run; the user's agreement establishes what you may spend to make it.

The commission can cover a whole production, including reference transcription, generated media
and semantic alignment, or just the reference analysis before the user decides to commission the
video. Early hosted transcription fits either scope. Establish its coverage before invoking
`hypit transcribe`, which immediately calls the selected Endpoint. For that reference, source
duration and the Provider's published rates can support the estimate; a production Invocation need not
exist yet. Local WhisperX has no hosted Provider call charge. As the creative plan becomes concrete,
`plan` and `pricing` expose the exact remaining requests for that Invocation.

Carry covered work forward and keep the user informed. The same agreement can apply across tool
calls and Builds; a new command is not itself a new authorization request. Ask for a new decision
when the work expands beyond the agreed scope or cost, or would use an account outside that agreement.
Use the current plan, available Results and costs already incurred or committed to judge the
remaining work. Treat estimates as estimates where actual charges are unavailable.

Preserve the user's agreement in [Brief](../creation/brief.md#brief-preserves-user-authority), and
resume from it alongside the current Invocation, Results and Progress. Normal composition work carries
usable generated media forward. A request to revise Caption or MG authorizes that revision;
additional media generation follows an intentional production choice covered by the paid scope.
Explain a meaningful change while proceeding when it is already covered; seek the user's decision
when it changes what they have agreed to fund.

## Submit one durable Build

```bash
hypit build path/to/main.svml --target final.video --title first-cut --follow
```

Every invocation creates a fresh time-ordered Build id and one independent Result, even when the Author Source
did not change. Repeating the same command does not resume an earlier Build or automatically alter the
production's selected material. The optional title is a human-facing
Result label; it does not replace the Build id or alter Source identity.

Build performs a cheap preflight and submits only when the selected deployment slice is ready. It
does not install packages or start a missing Managed Program. When the environment has already been
prepared and only the Worker is stopped, Build ensures that Worker becomes available. When
preparation is missing, prepare the selected Endpoint with `hypit programs prepare --endpoint <instance>`;
use `programs up` if its helper also needs starting. [Local preparation](../environment/local-tools.md#let-the-selected-endpoint-own-its-program)
explains their scope and the combined `runtime up` command. Submit again after the required preparation succeeds.

The Worker owns execution after durable submission. `--follow` only observes it; closing or
interrupting that terminal detaches the observer and leaves the Build running. Reattach with:

```bash
hypit status <build-id> --watch
```

A plain `status` reads one current snapshot. `--max-wait-ms` bounds how long a caller watches; it
does not bound or cancel the Build itself.

## Observe shared work and capacity

```bash
hypit activity
hypit runtime status
```

`activity` shows active Builds; `activity --verbose` also shows shared Provider capacity. The Worker may advance many unrelated
Builds together. Capacity belongs to the exact Endpoint instances, real shared pools, and any narrower
model limits declared by those Endpoints. Builds share only those actual resources, so unrelated work
can advance together.

Immediate work releases its capacity when it returns. An asynchronous Provider operation keeps its
claim while that same accepted operation is being polled to completion. An interrupted attempt
preserves available remote receipts; it does not resubmit the paid request.
When an action fails, the attempt ends and local reservations are released. Any last-observed remote
status remains evidence for deciding how to continue.

`activity --verbose --json` exposes actual resource claims when capacity explains a wait.
Task occupancy, overlapping network actions and starts permitted per time period are different
quantities. [Runtime profiles](../environment/profile.md) owns their configuration and selection;
the selected Provider's documentation owns its available settings.

## Separate active work from Result outcome

Runtime activity describes what is happening now. The finished Result records one outcome:
`complete`, `failed`, or `cancelled`. These are different facts. `status` reads both sources and may
therefore show, for example, a decided failure whose completed public Outputs are still being written
to its Result.

A failed or cancelled Build can retain useful public Outputs completed before its outcome. Inspect
them normally. Cancellation withdraws work that has not begun and asks an Endpoint once to cancel an
already submitted operation when it supports that; accepted completed output is retained.

If Result storage or cleanup fails after execution has decided its outcome, `status` reports operator
attention and the exact action:

```bash
hypit result finish <build-id>
```

That command writes from already accepted execution facts and working Resources. It does not repeat
external work, resubmit generation, or alter a realization choice. Use it only for the Result write named by
`status`. `hypit result discard <build-id>` applies only to an incomplete submission that never became
active and has no Result to finish.

When the user asks to stop submitted work, cancel that exact Build explicitly:

```bash
hypit cancel <build-id> --reason "superseded by the corrected Invocation"
```

Check the reported state afterward. Detaching the observer does not send this cancellation, and a
cancellation request cannot undo already completed Provider work. Preserve completed usable Outputs
and leave unrelated Builds alone.

`runtime down` stops that Runtime's Worker. Its unfinished Builds end; starting the Worker again does
not resume them. Completed Outputs and recorded receipts remain available for explicit reuse in a
new Build. Stopping the Worker does not itself cancel remote Provider work; use `cancel` for a
selected active Build.

## Browse and export project Results

```bash
hypit builds
hypit inspect <build-id>
hypit history <public-output-name>
hypit get <build-id> --output <public-output-name> --to <destination>
```

`builds` lists finished project Results newest first. `inspect` shows one Result's Targets,
highlighted Outputs and outcome. Use `inspect <build-id> --output <public-output-name>` for a known
Output, or `--verbose` to browse all available names and receipts. A Result can expose many public
Outputs. `history` finds one named Output across Results; it does not select one for the current
production. `get` exports one named Output to one explicit destination:

- a value with no referenced files becomes a JSON file;
- a file Output becomes one file with its original bytes;
- a structured value with referenced files becomes a directory containing `value.json` and those files.

The destination remains a user-facing export. The original Result stays in the project's
`.hypit/results` directory on the machine running Hypit.

Give useful Results presentation metadata when it helps people and Studio find them:

```bash
hypit result edit <build-id> --title "podcast take · coral captions" \
  --note "speaker timing and framing for the current production" \
  --highlight podcast-take.video
```

The title, note, and highlights live in that Result manifest. They do not rename its public Outputs
or create a project-wide history index. Once exported, the receiving package's ordinary Author
declaration owns how that file enters the production.

## Keep Results with the project

Result storage belongs to the video project at `.hypit/results`. Result listing, export, history and
Studio's finished library all read that directory. Moving or archiving completed Results is ordinary
project/file management performed after a Build; it is not a live Runtime repository choice.

A submitted Build retains its exact project Result directory. Preserve a Result while its execution
evidence or unexported files remain useful. Long-lived production material should live at explicit
project paths rather than depend on Result cleanup policy.

[Project handoff](../creation/project-files.md#hand-over-an-editable-production) explains carrying
those Results and the authored work to another machine or collaborator.

## Build with the current project code

Each new local Build loads the current project implementation and selected Provider configuration.
Edit project components or the Profile, then create a new Build;
previously started work keeps its loaded implementation. Keep completed material through ordinary
project assets and authored realization choices when changing composition. Warm services such as
WhisperX remain available across Builds.

Concurrent Builds share execution infrastructure; remote waiting does not reserve a whole-Build slot.
A lost Worker ends its affected attempts; completed Outputs and available remote receipts are
retained. Continue with a new Build after carrying accepted files into the project. Files that a component reads later retain
their own filesystem lifetime.

Changing the installed Distribution or the Worker's inherited shell environment requires restarting
the Worker. Inspect `hypit activity` first. External writable credential
stores may expose updated values directly; environment-backed credentials use the environment in
which the Worker was started. `hypit runtime down` stops the Worker and its active Builds;
Managed Programs have their own lifetime.
