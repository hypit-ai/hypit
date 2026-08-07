# Self-described Source and dual-graph compilation

Status: implemented boundary, 2026-08-07.

This document defines the domain-neutral path from human files to a frozen Build. It exists to make
one rule unambiguous:

> Author Graph and Run Graph are two necessary, peer inputs. A filename suffix, CLI flag or Runtime
> may not secretly supply either graph's meaning.

## 1. Three different authorities

| Input | Authority | Typical suffix |
|---|---|---|
| Author Source | what the author declares and how declarations connect | `.svml`, `.svs`, or another package convention |
| Run Source | which Author Source, Target set and explicit Candidate satisfactions this Build uses | `.svrun` |
| Runtime Profile | where the already frozen work executes, with which Stores, Endpoints and permissions | `.json` / trusted embedding code |

Only the first two compile into graphs. Runtime Profile is deployment configuration and cannot add a
Target, Candidate, Satisfaction or author component.

The suffix is never parser authority. Every Author or Run Source begins with exactly one Header:

```xml
<?svml using="@svml/text@1"?>
```

`@svml/source` recognizes only this bounded bootstrap grammar. It does not recognize `<svml>`,
`<script>`, `<svrun>`, an import or any domain type. It selects an already trusted Frontend by exact
id, then masks the Header while preserving source offsets. Missing, duplicate, malformed or unknown
Headers fail closed; there is no default Frontend.

## 2. Author Source closure

A Text-authored entry may import logical modules and other Author Sources:

```xml
<?svml using="@svml/text@1"?>
<svml>
  <import from="@svml/script@1"/>
  <import as="studio" source="./studio.svs"/>
  <!-- author body -->
</svml>
```

The two imports are intentionally different:

- `from=` closes a versioned logical Module Manifest used by this Frontend;
- `source=` asks the Workspace for another source unit.

The importer does not choose the imported source's parser. `studio.svs` must carry its own Header,
for example `<?svml using="@svml/svs@1"?>`. Recursive discovery therefore produces one closure in
which every source unit independently binds:

- requested Frontend id;
- resolved Frontend id and implementation digest;
- original source-byte digest;
- decoded semantic digest;
- imported source edges and their Frontend identities.

The Author Frontend and Elaborator then produce one typed Author Graph. A different surface syntax
may produce the same semantic graph while retaining a different source and Frontend identity.

## 3. Run Source closure

The official Text Run Source is likewise self-described:

```xml
<?svml using="@svml/run-text@1"?>
<svrun version="1" targets="delivery">
  <author source="./main.svml"/>

  <target-set id="delivery">
    <target output="final.video" accepts="exact"/>
  </target-set>
</svrun>
```

`<author>` is mandatory and is the first declaration. It names the Author Source but does not
select its Frontend; `main.svml` selects itself through its Header.

The Run Frontend produces a syntax-neutral `RunDocument`. `@svml/run` binds the Run source bytes,
Frontend implementation and semantic digest into a `RunSourceClosure`, resolves author export
names, instantiates imported Run Fragments, and seals one complete `RunGraph` containing:

- the exact Author Graph digest;
- the Run Source Closure digest;
- Run Candidates and Operations;
- explicit Satisfaction edges;
- all named Target sets and the selected set.

Run-only Fragments may use Producers whose Modules the Author Source never imported. The reference
compiler derives those Module references from the declared Fragment types and Operations, closes
their registered Manifest dependencies, and rebinds the Author typed modules to this larger
**execution Program Closure**. It does not add vocabulary to the Author Source and does not change
the Author Graph id. The final Build id separately binds the execution closure digest.

A Target-only run still has a Run Graph. An alternate Candidate is optional; execution intent is
not.

## 4. Deterministic composition before execution

The compiler first closes both sources, then resolves realization and freezes planning input:

```text
Author Source ──Header→ Author Frontend ──Elaborator→ Author Graph ──┐
                                                                    ├─ compose → Compiled Graph
Run Source    ──Header→ Run Frontend    ──Run compiler→ Run Graph ──┘              │
                                                                                   ▼
                                                                            finite BuildPlan
```

There is no graph mutation during scheduling. Run Candidates and Operations are composed into a
new immutable graph; reverse demand from the selected Target set prunes unreachable defaults. One
declared multi-export Fragment instance shares its Operations. Two declarations are two instances,
even if their content is identical.

The final compiled graph identity binds both `AuthorGraph.id` and `RunGraph.id`. The BuildRequest
then binds that graph, the selected Target set, Satisfaction edges and implementation closure, while
Build identity binds the execution Program Closure. Only after all of those facts verify may the
Scheduler issue a Command.

## 5. Data gates

| Gate | Accepts | Rejects before crossing |
|---|---|---|
| Source Header | source bytes and exact Frontend id | suffix defaults, duplicate Header, unknown Frontend |
| Workspace | source/asset locator within one session | ambient package filesystem access, source drift |
| Source Closure | byte, Frontend and semantic identities | undiscovered imports, recursive cycles, digest drift |
| Author linker | typed records, components and fragments | unknown exports, invalid schema/type ownership |
| Run compiler | Author exports, execution Module Closure and explicit Run declarations | hidden CLI Target/Pin intent, unknown Candidate/export or Producer Module |
| Graph/plan | complete immutable dual-graph input | runtime topology choice, content cache guessing |
| Runtime coverage | exact Producers, Endpoints and services | unbound Need, undeclared permission or credential slot |
| Core transition | verified Event/Receipt/Derivation | stale or tampered command/result identity |

These gates deliberately do not pass a universal metadata object down the pipeline. Dependencies
are ordinary graph edges; intrinsic Values carry only the identity needed by their owning contract.

## 6. Package extension

An Author or Run Frontend is executable trusted code. A locked Node package may contribute either
kind by id and implementation digest. Source only selects among Frontends already admitted by the
Host; `using=` never downloads or authorizes a package.

Trusted Run Fragment libraries are not a special Package Loader field. They expose a generic Host
Facet with ABI `svml.run-fragment-host@1`. The Loader byte-locks its opaque canonical identity; the
Run Host alone checks that the declared package/export/digest set matches the implementation before
registration.

This preserves open extension without making Core or the generic Loader understand Text, `.svrun`,
video, preview methods or any future domain.
