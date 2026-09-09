# Planning, Builds, and Results

Read this when inspecting the work selected by a Run, obtaining spending authority, submitting a
Build, continuing after a failed attempt, following work after an observer disconnects, or retrieving
completed Outputs.

[Runs](runs.md) owns Candidate syntax and substitutes. [System relationships](system.md) explains
how the selected graph becomes a Build, and [rendering](rendering.md) covers whole or partial video outputs.

## Reuse available Outputs and identify active Builds

For a revision, identify the relevant Run and its completed Outputs, then preserve the still-useful
ones with `build-record` and `satisfy`. Keep unrelated Candidate selections. [Authoring](authoring.md#reuse-produced-work-explicitly)
explains which media or SemanticTake Output to keep without freezing the downstream edit. A failed
Build can still supply completed Outputs; a missing exported file is not evidence of missing media.

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
submission from its Run, Source and submission time. Follow active work with `status --watch` and
reuse completed Outputs. A closed terminal or interrupted
observation is distinct from a failed Provider request inside the Build. Finishing an incomplete
Result is covered below and does not require regenerating media.

## Continue after a failed attempt

A failed Build leaves the work and evidence produced by that attempt. Prepare a new Run that selects
its usable Outputs through `build-record` and `satisfy`, then submit a new Build for the remaining
work. The next attempt's choices belong in that Run; the earlier Build retains its failure.

When a Provider task-submission request times out without a task ID or another usable receipt,
the Result can establish the request failure and absence of a receipt, while the remote outcome remains
unknown. A later submission is a new Build. Assess its paid requests against the
[agreed scope and cost](#work-within-the-agreed-paid-scope), and select any Outputs already available
from the earlier attempt in its Run.

When a usable receipt does exist and gives access to a generated asset, the Agent can retrieve that
asset as an ordinary project file and select it with `file` and `satisfy` in the new Run. This supplies
the file Output; downstream preparation and alignment still run when needed. A completed SemanticTake
can instead be reused directly through its existing Result Output.

Use `status <build-id> --verbose` for active task receipts and `inspect <build-id> --json` for the
finished Result's execution records. They include the Endpoint, Need identity, credential references,
known task ID, and the recorded error or last progress. Secret values stay in their Credential Store.

## Plan the selected Run

Plan the actual Run after its reuse choices and requested changes are expressed:

```bash
hypit check path/to/build.svrun
hypit plan path/to/build.svrun
```

`check` validates the self-described Sources and graph without executing them. `plan` freezes the
demanded subgraph after applying the Run's Candidate selections and lists every external Need that
would be sent. Planning starts no external work.

With a selected Runtime Profile, the plan also names the Endpoint behind each request, applies that
Endpoint's request-support rules, checks cheap readiness for the demanded capabilities, and shows the
Provider's declared price page or that its price source is unknown. Planning remains local and does
not require a billing account to answer.

Read the current pricing material selected Providers expose for these same Needs:

```bash
hypit pricing path/to/build.svrun
```

`pricing` is an explicit read-only network operation. It creates no Build and submits no generation.
The default report groups matching requests by their selected Endpoint and pricing material, showing
known parameters, request counts, and the Provider's rate summary or document with its source URL. Explicit
no-charge work is summarized in one count. Missing pricing declarations and failed queries stay
visible as uncertainty; a declared price page remains useful when the Provider supplies no document.

Use the stated units and conditions together with authored duration, resolution, count, or other
billing facts to calculate and explain the expected cost. Providers may publish several price tiers
for one model; match the request to the applicable conditions. A future audio input may not have a
known duration yet. Use its per-audio-second rate with an explicitly estimated length from the
production plan, keeping that estimate distinct from measured usage. Hypit itself calculates no total.

`--json` puts each group's `requests` beside its `pricingDocuments`, retaining the Provider's original
data. Both views include all pricing groups by default. `--limit <count>` shortens only the human
view; `--verbose` shows original documents and the no-charge work. Read the relevant groups and explain
the expected cost of the described work, the account that would pay and any material uncertainty.

Read the remaining Needs against this change. A Caption or MG-only revision should keep its existing
media generation satisfied; replacing selected B-roll should leave the unchanged performance satisfied.
Rendering and other required processing may still appear as Needs. Explain each new media request
from the user's goal or an explicit generation decision. If a request appears because a Candidate was
lost or never selected, repair the Run and plan again before asking to spend or submitting work.

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
duration and the Provider's published rates can support the estimate; a production Run need not
exist yet. Local WhisperX has no hosted Provider call charge. As the creative plan becomes concrete,
`plan` and `pricing` expose the exact remaining requests for that Run.

Carry covered work forward and keep the user informed. The same agreement can apply across tool
calls and Builds; a new command is not itself a new authorization request. Ask for a new decision
when the work expands beyond the agreed scope or cost, or would use an account outside that agreement.
Use the current plan, available Results and costs already incurred or committed to judge the
remaining work. Treat estimates as estimates where actual charges are unavailable.

Preserve the user's agreement in [Brief](../creation/brief.md#brief-preserves-user-authority), and
resume from it alongside the current Run, Results and Progress. Normal composition work carries
usable generated media forward. A request to revise Caption or MG authorizes that revision;
additional media generation follows an intentional production choice covered by the paid scope.
Explain a meaningful change while proceeding when it is already covered; seek the user's decision
when it changes what they have agreed to fund.

## Submit one durable Build

```bash
hypit build path/to/build.svrun --title first-cut --follow
```

Every invocation creates a fresh time-ordered Build id and one independent Result, even when the Run
did not change. Cross-Build reuse requires explicit Run Candidates; repeating the same command does
not resume the earlier Build or automatically select its Outputs. The optional title is a human-facing
Result label; it does not replace the Build id or alter Source identity.

Build performs a cheap preflight and submits only when the selected deployment slice is ready. It
does not install packages or start a missing Managed Program. When the environment has already been
prepared and only the Worker is stopped, Build ensures that Worker becomes available. When
preparation is missing, use `hypit runtime up` as described in `../environment/profile.md` and submit
again after it succeeds.

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

`activity` shows active Builds and shared Provider capacity. The Worker may advance many unrelated
Builds together. Capacity belongs to the exact Endpoint instances, real shared pools, and any narrower
model limits declared by those Endpoints. Builds share only those actual resources, so unrelated work
can advance together.

Immediate work releases its capacity when it returns. An asynchronous Provider operation keeps its
claim while that same accepted operation is being polled to completion. A Worker restart continues
stored Provider operations rather than submitting their paid request again.
When an action fails, the attempt ends and local reservations are released. Any last-observed remote
status remains evidence, rather than a condition the old Build must resolve before the next attempt.

Providers that expose `actionLimits` can separately limit asynchronous `submit`, `poll` and `collect`
actions through `concurrency` and `rate: { limit, periodMs }`. These budgets share the Profile's pool.
Task occupancy, overlapping network actions and starts permitted per time period are different quantities;
`activity --json` exposes the actual resource claims. Provider-local documentation owns available settings.

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

That command writes from already accepted execution facts and working Resources. It does not invoke a
Producer, resubmit generation, or choose another Candidate. Use it only for the Result write named by
`status`. `hypit result discard <build-id>` applies only to an incomplete submission that never became
active and has no Result to finish.

When the user asks to stop submitted work, cancel that exact Build explicitly:

```bash
hypit cancel <build-id> --reason "superseded by the corrected Run"
```

Check the reported state afterward. Detaching the observer does not send this cancellation, and a
cancellation request cannot undo already completed Provider work. Preserve completed usable Outputs
and leave unrelated Builds alone.

Stopping a Worker is different from cancellation. `runtime down` pauses advancement of all active
Builds in that project Runtime; their durable facts remain available for the next Worker.

## Browse and export project Results

```bash
hypit builds
hypit inspect <build-id>
hypit history <public-output-name>
hypit get <build-id> --output <public-output-name> --to <destination>
```

`builds` lists finished project Results newest first. `inspect` shows one Result and its exact public
Output names. `history` finds one named Output across Results; it does not select one for the current
Run. `get` exports one named Output to one explicit destination:

- a Scalar becomes a JSON file;
- a Resource becomes one streamed file;
- a Composite becomes a directory containing `value.json` and its referenced Resources.

The destination remains a user-facing export. The original Result stays in the project's selected
repository. The default filesystem repository lives under the project; `hypit.results.json` may
select another adapter such as S3 without changing these commands or the Run.

Give useful Results presentation metadata when it helps people and Studio find them:

```bash
hypit result edit <build-id> --title "podcast take · coral captions" \
  --note "speaker timing and framing for the current production" \
  --highlight podcast-take.video
```

The title, note, and highlights live in that Result manifest. They do not rename its public Outputs
or create a project-wide history index. Reuse still names the exact Build id and Output through the
Run mechanism in `authoring.md`.

## Select the Result repository deliberately

Result storage belongs to the video project. The official default is the filesystem repository at
`.hypit/results`. An explicit `hypit.results.json` selects an adapter with the envelope
`format: "hypit.build-results@1"`, `use` and adapter-owned `config`. Read the installed
`@hypit/build-result-fs` README for a custom filesystem path, or `@hypit/build-result-s3` for bucket,
prefix, deployment options and its credential setup. `hypit.results.json` owns Result storage;
the Runtime Profile owns execution, and the S3 adapter owns its credentials.

`hypit paths` locates the project; `hypit doctor` checks its selected repository, even without a
Runtime Profile. Result listing, export, history and Studio's finished library read that repository.
If expected Results are absent, first check the selected project and Result repository.

A submitted Build retains the repository destination captured at submission. Changing the project
selection while it runs does not redirect its eventual Result. Use the original destination to
find that Result; changing a selection does not migrate earlier history. Preserve any Result that
still supplies a Run Candidate: exported files are optional copies, and explicit reuse may still
reference Resources in the original Result.

[Project handoff](../creation/project-files.md#hand-over-an-editable-production) explains carrying
those Results and the authored work to another machine or collaborator.

## Reload changed execution code deliberately

A running Worker keeps the Runtime Profile, inherited environment, Distribution code, and package
implementations it has already loaded. Before restarting it for a changed Profile, environment-backed
credential, Distribution, or loaded project package, inspect `hypit activity` and preserve active
work. Stop an idle Worker with `hypit runtime down`; the next prepared Build can start a fresh one.

Credentials resolved from a writable external store may be visible without a process restart, while
environment variables are inherited when the Worker process starts. Let the Credential Store and
current Provider error determine which case applies instead of treating every authentication failure
as a restart problem.
