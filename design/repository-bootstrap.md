# New repository bootstrap

> Status: implementation birth plan. The system constitution remains stable as implementation grows.

## Clean implementation boundary

The repository begins with:

- `AGENTS.md`;
- this design set;
- license and ordinary package-manager configuration;
- one real production example;
- source modules and packages required by the active vertical slice.

The previous repository remains available as history and a code quarry. The new repository establishes its
own implementation, dependency graph, releases and product documentation.

## Suggested initial shape

```text
hypit/
├─ AGENTS.md
├─ README.md
├─ design/
├─ src/                    # root distribution and product composition
├─ packages/               # proven independent release boundaries
├─ examples/
│  └─ first-production/
├─ package.json
└─ package-manager lockfile
```

A logical owner may begin as a source module. An npm package forms when an independent consumer, release,
compatibility, selection, owner, platform-weight or deployment boundary becomes real.

The root `@hypit/hypit` package is the distribution and public facade. It contains product composition and
same-lifecycle source modules and depends directly on independently released owners.

## Birth sequence

### 0. Preserve the previous workspace

Preserve the current user work and uncommitted owner implementations in a recoverable local snapshot.
Respect files intentionally kept local and retain the previous worktree as the source record.

### 1. Establish the constitutional commit

Commit `AGENTS.md`, the design set, root product README, license and minimal package-manager files.

### 2. Establish direct NLE production

Create one small real project that demonstrates:

```text
TSX author program + accepted Media + project component
  -> explicit NLE materialization
  -> NLE Project transaction
  -> audiovisual evaluation
  -> direct delivery file
```

This slice establishes Project Boundary, Media reference, ordinary component module loading, author-program
materialization, NLE ownership and owner-specific audiovisual delivery. The test must then edit and reopen the NLE
document without re-running the author program.

### 3. Establish explicit generation-to-edit production

Extend a project with:

```text
explicit Capability Invocation
  -> selected Execution Environment recovery
  -> Publication
  -> Media or document adoption
  -> NLE transaction
  -> delivery
```

This slice establishes the boundary between durable model execution and author facts.

### 4. Add Canvas authoring

Add Graph and Workspace owners. Canvas saves recipes, typed relations, layout, Invocation references and
explicit Publication selections. “Generate current node” submits one node whose operation inputs resolve to
completed selected values.

### 5. Add specialized owners and views

Scene, semantic analysis, feedback, object index and professional Benches join when a production requires
their facts and Actions. Each addition begins with its owner definition and one production use.

## Selecting code from the previous repository

Move behavior in response to a current production need. For every selected implementation:

1. name the current owner fact or Action it serves;
2. identify the new production slice that consumes it;
3. copy the smallest coherent implementation and essential domain evidence;
4. adapt its dependencies to the current owner's inputs and seams;
5. place it in the source or package boundary justified by its consumers;
6. record useful source commit and path provenance in the reuse commit message;
7. continue maintenance in the new owner location.

High-value donor areas include direct NLE facts and transactions, audiovisual evaluation, accepted Media,
recoverable Capability Invocation, Publication closure, owner Services and project component
implementations.

Reuse the current owner fact or Action required by a production slice; place a TSX materializer, NLE document fact or
delivery compilation rule under its current owner.

## Verification strategy

The initial evidence set observes:

- NLE transactions preserve direct author facts and produce the expected Programme;
- the audiovisual executor delivers a playable file from that Programme;
- project components load through ordinary installed package selection;
- one recoverable Invocation resumes the same Provider work and closes one Publication;
- Adoption writes the selected target owner;
- an unresolved operation input returns a precise diagnostic and preserves existing owner facts.

Type checking and release builds verify package integrity. The two production examples establish the
principal seams and observable owner behavior.

## Transition point

The new repository becomes the active implementation when it can:

1. create and deliver one real NLE production with a project component;
2. perform and recover one explicit model Invocation;
3. adopt its Publication into an owner and use it in a delivery;
4. install and run from its own declared dependencies.

Subsequent capabilities move in response to real production requirements.
