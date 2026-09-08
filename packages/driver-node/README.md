# `@hypit/driver-node`

Node execution of commands produced by the domain neutral Core.

`ProducerRegistry` installs deterministic component handlers. `EndpointRegistry` installs exact
capability implementations. `NodeDriver.prepare()` regenerates the current commands from Core and
classifies each as runnable or blocked; it does not search the graph or choose a candidate.

Producer handlers receive immutable typed inputs. External work is represented by a declared Need
and fulfilled by an exact endpoint. When several endpoints offer the same capability, the Runtime
configuration must bind one explicitly.

Immediate endpoints run once. Asynchronous endpoints start a task, store its handle in an
`OperationStore`, and poll it until completion or failure. An optional `collect` action obtains already-generated
artifacts after remote completion. Polling uses the stored Need and handle without loading its whole
Build. Credentials are resolved only for slots declared by the selected endpoint; simultaneous reads
of the same credential are coalesced. Cancellation is best effort and never rolls back completed work.
A failed action retains its receipt and error for the Result; the Driver does not retry or reconcile it.

`acceptOperation()` validates an already received value without making a remote call. Runtime can
retain such a sibling result when another Need fails, without polling unfinished jobs to completion.
The Driver validates returned values before offering a command result to Core. It does not load
packages, parse source files, own the active Build work set or know any video vocabulary.
