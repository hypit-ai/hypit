# `@hypit/executor`

Environment-neutral execution of commands produced by the domain-neutral Kernel.

`ProducerRegistry` installs deterministic component handlers. `EndpointRegistry` installs exact
capability implementations. `Executor.prepare()` regenerates the current commands from Core and
classifies each as runnable or blocked; it does not search the graph or choose a realization.

Producer handlers receive immutable typed inputs. External work is represented by a declared Need
and fulfilled by an exact endpoint. When several endpoints offer the same capability, the Runtime
configuration must bind one explicitly.

Immediate endpoints run once. Asynchronous endpoints start a task, store its handle in an
`OperationStore`, and poll it until completion or failure. An optional `collect` action obtains already-generated
artifacts after remote completion. Polling uses the stored Need and handle without loading its whole
Build. Credentials are resolved only for slots declared by the selected endpoint; simultaneous reads
of the same credential are coalesced. Cancellation is best effort and never rolls back completed work.
Before an asynchronous `start` returns, its Endpoint may checkpoint an accepted or ended remote task.
The Executor persists that handle and optional receipt immediately. If later local work in the same
submission throws, the acknowledged Operation remains runnable from `poll` or `collect`; it never
falls back to `submit`. An unacknowledged failed action retains its error for the Result. The Executor
does not infer remote work, reconcile unknown submissions or create another attempt.

Immediate calls and asynchronous submit, poll and collect actions receive the same progress and
diagnostic callbacks. Progress reaches the caller while the action is running; changes of phase also
enter the execution log. The Endpoint supplies the content, and the Executor forwards it with the
selected Endpoint identity without interpreting service-specific phases or treating progress as a receipt.

`acceptOperation()` validates an already received value without making a remote call. Runtime can
retain such a sibling result when another Need fails, without polling unfinished jobs to completion.
The Executor validates returned values before offering a command result to the Kernel. It does not load
packages, parse source files, own the active Build work set or know any video vocabulary.
