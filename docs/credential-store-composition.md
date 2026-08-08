# Credential store composition

Status: analysis, not implemented. Recorded 2026-08-09 because a second
CredentialStore implementation made the question concrete, and the answer costs
more than the need currently justifies.

## What is true today

`CredentialRef` carries a store name:

```ts
type CredentialRef = {
  readonly format: "svml.credential-ref@1";
  readonly store: string;   // "env", "keychain", …
  readonly key: string;
};
```

Each implementation answers only for its own name and declines the rest by
returning `undefined`. `@narratage/credential-store-env` returns `undefined`
for anything that is not `"env"`; `@narratage/credential-store-keychain` does
the same for `"keychain"`.

A Runtime holds exactly one credential-store. `chooseService` refuses a second,
and the execution driver reads a single `undefined` as *this credential is
unavailable* and fails the Operation.

So the two facts do not compose. A deployment that keeps API keys in the
environment and signing keys in the keychain cannot be expressed, and `store`
is decoration: it must name whichever single store happens to be installed.

## Why the role could hold several

`scheduler` must be unique because two schedulers would contend for one set of
Operations. That is a real conflict.

Credential stores do not contend. `ref.store` already decides which one answers,
so composition is total and order-free: each store declines what is not
addressed to it, and the name decides rather than the position. That property is
asserted in `packages/credential-store-keychain/test/store.test.ts`, which is
the specification for any future change.

By that reading `credential-store` resembles `capability-endpoint` — many
instances, dispatched by a declared key — more than it resembles `scheduler`.

## Why it is not simply a type change

`RuntimeProfile.stores.credentials` is a `string`. It is embedded in
`RuntimeClosure`, which is digested, and every recoverable Operation records
that digest:

```text
RuntimeProfile.stores.credentials : string
  → RuntimeClosure { profile, stores, … } → digest
  → Operation snapshot { runtimeClosure: <digest> }
  → resume compares it: driver.ts, "not one contiguous retry chain"
```

Widening the field to an array changes the closure digest, so every in-flight
recoverable Operation — a submitted generation task still polling, a render
still running — fails to resume, and fails with a message about retry chains
that points nowhere near the cause. It would also require
`svml.runtime-closure@2`.

## The shape that would not break it

Compose below the role rather than widening it. Several stores are registered as
ordinary instances, and one composite instance fills the role:

```jsonc
"runtimeServices": [
  { "use": "@narratage/credential-store-env",       "instance": "credentials.env" },
  { "use": "@narratage/credential-store-keychain",  "instance": "credentials.keychain" },
  { "use": "@narratage/credential-store-composite", "instance": "credentials",
    "config": { "stores": ["credentials.env", "credentials.keychain"] } }
]
```

`stores.credentials` stays the single string `"credentials"`. The Profile shape,
the closure digest and every recorded Operation are untouched, and what was
composed is not lost: it lives in the composite instance's
`configurationDigest`, so two different compositions remain two different
identities.

The driver's failure message should then also name the stores that were
consulted, so *no keychain store is installed* stops looking like *the keychain
has no such entry*.

## Why it is not done

No Provider declares a reference to any store but `env`. The only caller of the
second implementation is its own test. Building the composite would add a
package and a layer of indirection to serve a deployment nobody has asked for,
and the repository deletes what has no consumer.

The better moment is the first deployment that genuinely needs two stores,
because that deployment will also say which two. If the pair turns out to be
environment and AWS Secrets Manager, composition may be the wrong answer
entirely — the AWS SDK resolves its own credential chain, so that store would
answer for one name and reach several sources behind it.
