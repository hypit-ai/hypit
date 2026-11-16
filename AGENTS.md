# Hypit repository instructions

## Read the system from its authorities

Before changing Hypit, read:

1. `design/README.md`;
2. `design/system-constitution.md`;
3. the owner document for the fact or action being changed.

The system constitution defines the stable system. Owner designs define domain meaning and lifecycles.
Package and source layout project those established boundaries into implementation.

## System definition

Hypit is a federated, modular, local-first video production system. A local Project Boundary contains
independent owner documents, accepted media, project components and explicit references. Owner Services
open and edit those facts. Specialized Executors perform durable or platform-dependent Actions. Agent,
App, CLI, Bench and project programs are explicit callers and projections of those authorities.

## Authority and action

- Each author fact has one domain owner.
- A relationship describes value origin, placement or meaning.
- A user, Agent or explicit program starts every Invocation and Action.
- Canvas holds AIGC recipes, typed relations, Invocation attachments and explicit Publication selections.
- The language runtime and operating system provide ordinary control flow, concurrency, processes and file
  I/O.
- The selected Execution Environment owns Provider/model capacity and recoverable Capability Invocations.
- A completed recoverable Invocation closes typed outputs and owned resources as a Publication.
- A target owner accepts a Publication through an explicit adoption or materialization Action.
- NLE owns tracks, items, direct edit time, effects and audiovisual delivery.
- Scene, Media, semantic evidence, Script and Feedback each preserve their own authoring and evaluation
  boundaries.
- npm and the project lockfile own installed implementation versions.

## Project components and framework development

Hypit users are commonly component authors. Creating a component, Operator, Model or other owner-specific
extension in a project's `packages/` directory is ordinary video production. Changing its loading,
execution, versioning or current public contract is framework development.

Study and reuse installed capabilities when they fit. Create a project component when the work introduces a
new visual role, structure, behavior or semantic concept.

## Code and package decisions

For every change, identify:

1. the fact or Action owner;
2. its document, open-session or invocation lifetime;
3. its Service or Executor;
4. its callers and installation boundary;
5. its source and release shape.

An npm package represents an independent release, public-contract, ownership, selection, consumer,
platform-weight or deployment boundary. Responsibilities with one release owner and lifecycle remain source
modules inside that release unit.

Project loading follows explicit package selection and ordinary package-manager installation. A missing
package produces a precise diagnostic containing the required package and referring owner object.

## Verification and documentation

Do not create or restore automated tests, test fixtures, snapshots, golden files or test-only harnesses
unless the user explicitly reverses this instruction. The repository intentionally carries no automated
test suite. Verify current work through type checking, builds, direct inspection and the concrete production
path being changed.

Stable cross-owner decisions live in `design/`. Exact schemas and interfaces live beside their owner
implementation. Public documentation describes working product behavior. Git history and the previous
repository preserve historical reasoning.

Architecture changes update their owner boundary and working product documentation. Performance
investigations remain explicit and temporary, with a stated production question.

## Erase discarded architectures completely

The current authorities describe the only live architecture. Once a design, schema, command, owner split or
public name is replaced, erase its vocabulary and representation from current source, types, Readers,
serializers, adapters, diagnostics, examples and documentation. Historical reasoning belongs only in Git and
the previous repository.

Do not practice architectural necromancy. Forward ghost compatibility includes conversion Readers, aliases,
fallback branches, adapters and copied fields that still accept or reconstruct a discarded model. Reverse
ghost compatibility includes branches, errors, documentation or other current artifacts that explicitly name
an obsolete model merely to reject it. Both give a dead architecture continuing authority over the new system.

A current Reader validates only the current schema. Unknown input fails through current structural rules,
without enumerating historical alternatives. When replacing an unreleased design, update all current producers,
consumers and documentation directly. Before completing the replacement, search the repository for its obsolete
identifiers and remove every remaining occurrence outside Git history.

## Reuse from the previous repository

The previous repository is a source quarry and historical record. Move behavior when a current vertical
slice has a concrete consumer for it. Re-home the selected implementation under its current owner, simplify
its dependencies and establish evidence for the current fact. Record useful provenance in the reuse
commit message.

Existing user changes take precedence. Remote publication, pull requests and archival actions require the
user's explicit request.
