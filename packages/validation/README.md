# `@narratage/validation`

Host-side admission for package-owned semantic Types.

A module owns the meaning of every `TypeRef` it declares. Core always checks the Type's structural
Schema. When structure is insufficient, the owner may also lock a pure validator implementation
digest in its static Manifest. The reference Host registers that exact Type and implementation
digest here.

`validateValue()` runs the owner validator as a Host admission gate. `admitRecord()` applies the
same gate to authored or externally provided Records. `NodeDriver` applies it to Producer and
Provider results before creating an Event. Core neither executes the validator nor learns the
domain meaning; admitted Records carry no validation metadata through the graph.

Validators are refinements, not converters. They may accept or reject a value; they may not rewrite
it, create graph edges, select a Provider, read credentials or add author intent. Cross-package
communication therefore remains decentralized:

```text
Type owner Manifest  -> nominal Type + Schema + optional validator digest
Producer package     -> emits that exact TypeRef
Consumer package     -> accepts that exact TypeRef
Host admission       -> executes the locked validator
Core                 -> verifies graph typing and structural Schema
```

The current reference registry executes trusted in-process handlers. Community validator execution
still requires the planned code-byte verification, resource limits and sandbox/worker boundary.
Until then only trusted installed implementations may be registered.
