# Planning, Builds, and Results

Read this when inspecting the work selected by a Run, obtaining spending authority, submitting a
Build, following active work, or retrieving completed public Outputs.

## Plan the selected Run

`authoring.md` owns the meaning of Target, Candidate, and Satisfaction. This page begins after the Run
has expressed that execution intention.

```bash
hypit check path/to/build.svrun
hypit plan path/to/build.svrun
```

`check` validates the self-described Sources and graph without executing them. `plan` freezes the
demanded subgraph after applying the Run's Candidate selections and lists every external Need that
would be sent. Planning starts no external work.

With a selected Runtime Profile, the plan also names the Endpoint behind each request, applies that
Endpoint's request-support rules, checks cheap readiness for the demanded capabilities, and shows the
Provider's declared price page or that its price source is unknown. Hypit does not copy changing rate
tables or manufacture a total. Use the linked Provider source together with the plan's real request
counts and authored parameters when a cost judgment is needed.

Before new paid work, tell the user which requests and Provider Endpoints the plan selected and link
their price sources. Existing explicit authorization for that described work is sufficient; otherwise
obtain authorization before `build`. A later plan that materially changes the paid requests needs a
new decision.

## Submit one durable Build

```bash
hypit build path/to/build.svrun --title first-cut --follow
```

Every invocation creates a fresh time-ordered Build id and one independent Result, even when the Run
did not change. The optional title is a human-facing Result label; it does not replace the Build id or
alter Source identity.

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

Cancel active work explicitly:

```bash
hypit cancel <build-id> --reason "superseded by the corrected Run"
```

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

## Reload changed execution code deliberately

A running Worker keeps the Runtime Profile, inherited environment, Distribution code, and package
implementations it has already loaded. Before restarting it for a changed Profile, environment-backed
credential, Distribution, or loaded project package, inspect `hypit activity` and preserve active
work. Stop an idle Worker with `hypit runtime down`; the next prepared Build can start a fresh one.

Credentials resolved from a writable external store may be visible without a process restart, while
environment variables are inherited when the Worker process starts. Let the Credential Store and
current Provider error determine which case applies instead of treating every authentication failure
as a restart problem.
