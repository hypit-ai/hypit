# Explicit programs and execution

> Status: current execution design for explicit project programs.

## Explicit programs coordinate actions

Hypit separates three kinds of fact:

1. **author relationships** describe value origin, placement and meaning;
2. **explicit programs** decide which actions happen, in what order and under which conditions;
3. **executor state machines** recover concrete durable Actions.

A program uses sequential statements, functions, promises, parallel groups, conditions, loops and error
handling. The language runtime and operating system schedule these operations. Owner documents retain the
author facts, and Executors retain the recovery facts for their Actions.

## Responsibility distribution

| Concern | Authority |
| --- | --- |
| program order, branching and loops | explicit project program |
| ordinary concurrency, processes and file I/O | language runtime and operating system |
| Provider/model/GPU capacity and rate limits | selected Execution Environment |
| submit, poll, collect, cancellation and recovery of one model call | Capability Invocation |
| durable completed typed output | Publication |
| acceptance into the work | target owner Adoption/Materialization |
| timeline edit and delivery | NLE Service and audiovisual executor |
| Scene recording | Scene executor |

After an interruption, a program reads explicit owner facts and Invocation addresses and chooses its next
Action. A program with additional continuation needs may own an explicit script-local checkpoint.

## Capability Invocation and Publication

An Ability owns the meaning and validation of its typed request and response. A Provider Endpoint owns the
wire protocol, credentials, supported request subset and deployment limits. The selected Execution
Environment owns one Invocation lifecycle:

```text
queued -> submitting -> running -> collecting -> received -> complete
                                                      \-> failed / cancelled
```

The Environment checkpoints a durable Provider receipt and resumes the same Provider work. Capacity claims
represent concrete deployment limits such as accounts, model queues, GPU slots and action-rate budgets.

Ability, Endpoint and Environment are separately selected. An Ability may be a project-installed semantic package.
A Provider Endpoint adapter is an application or worker implementation. An Execution Environment assembles one or
more explicit Endpoint adapters with credentials, capacity and recoverable storage, and publishes a finite capability
projection to its clients. ProjectHost receives a scoped client; it does not absorb the Environment or activate every
installed Provider package.

An Environment may run in the ApplicationHost service process, a dedicated local worker or a remote deployment. The
process placement does not change the Invocation contract. A dedicated Seedance process is justified by its deployment,
recovery, credential or shared-capacity boundary; an in-process Seedance Endpoint adapter uses the same Environment
interface.

A completed recoverable Invocation closes one or more named typed outputs and owned resources as a
Publication. Publication provides an exact stable address for reopening those outputs.

The ApplicationHost's Execution Directory registers and projects available Environments. The selected Environment,
rather than the directory or caller, owns Invocation recovery, Provider receipts and Publication resources. A caller
that reconnects through Desktop, Agent, CLI or browser observes the same recoverable Action by its durable address.

Adoption gives the output author meaning:

```text
Invocation -> Publication -> Media adoption -> NLE occurrence
Invocation -> Publication -> Transcript materialization
Scene record -> file -> Media adoption
NLE export -> delivery file -> optional Media adoption
```

## Project programs

A project program is executable project source. It may:

- read owner documents and selected Publications;
- start and await explicit Invocations and Actions;
- call revisioned owner commands;
- adopt or materialize completed outputs;
- create project components and values;
- use normal modules, functions, conditions, loops and structured concurrency;
- write deliveries to explicit destinations.

TypeScript project programs are the first executable semantic reference. They provide module loading,
typing, control flow, promises, error handling, debugging and operating-system access.

Project programs coordinate owner Actions and commands. A TSX author program is a separate source role: it declares
reusable audiovisual authoring structure and materializes NLE facts. Both use ordinary TypeScript modules, but a project
program does not become an NLE document merely by calling a command, and a TSX author program does not own Invocation
recovery or Executor state.
