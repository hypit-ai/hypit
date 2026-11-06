import type { Facet } from "@hypit/hypit/facet";
import {
  canonicalize,
  moduleKey,
  sameType,
  type CanonicalValue,
  type ModuleRef,
  type TypeRef,
  type TypedRecord,
  type Value,
} from "@hypit/hypit/protocol";
import type {
  AuthorActionAuthority,
  AuthorActionInvocation,
  AuthorEditSubject,
  AuthorElementProvenance,
  AuthorProvenance,
  AuthorStructureDeclarationNode,
  AuthorStructureDocument,
  AuthorValueRef,
} from "@hypit/hypit/author";
import { assertTemporalMap, assertTemporalMapRegionSet } from "@hypit/temporal/algebra";
import type { TemporalMap, TemporalMapRegionSet } from "@hypit/temporal/algebra";

export type NleProjectionValueRequirement = {
  /** Projector-local name used in `context.values`. */
  readonly id: string;
  readonly type: TypeRef;
  /** Exact author edge; Hosts never scan values by shape. */
  readonly from:
    | { readonly kind: "input"; readonly name: string }
    | { readonly kind: "output"; readonly name: string };
};

export type NleProjectionValue = {
  readonly type: TypeRef;
  readonly value: Value;
};

export type NleProjectedAction = {
  readonly id: string;
  readonly label: string;
  /** The declaration planner that actually owns the mutation. */
  readonly authority: AuthorActionAuthority;
  /** Owner-selected arguments that a Host must not let user input replace. */
  readonly preset: Readonly<Record<string, CanonicalValue>>;
};

export type NleTemporalProjectionItem = {
  readonly id: string;
  readonly label: string;
  readonly summary?: string;
  /** Display geometry only. Its existence grants no move, trim or split permission. */
  readonly regions: TemporalMapRegionSet;
  readonly actions: readonly NleProjectedAction[];
};

export type NleSubjectProjection = {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NleTemporalProjectionItem[];
};

export type NleSubjectProjectionContext = {
  readonly ownerId: string;
  readonly subject: AuthorEditSubject;
  readonly values: Readonly<Record<string, NleProjectionValue>>;
  /** Optional realised endpoint. The Mapping is complete occurrence-local → source-local truth. */
  readonly target?: { readonly id: string; readonly mapping: TemporalMap };
};

/** Typed values observed on the exact declaration edges named by each projector requirement. */
export type NleSubjectProjectionRequest = Omit<NleSubjectProjectionContext, "values"> & {
  readonly inputs: Readonly<Record<string, NleProjectionValue>>;
  readonly outputs: Readonly<Record<string, NleProjectionValue>>;
};

export type NleSubjectLocation = {
  /** Exact graph edge selected by the Programme domain owner. */
  readonly owner: AuthorValueRef;
  readonly target?: { readonly id: string; readonly mapping: TemporalMap };
};

export type NleProjectionObservation = {
  /** Materialized Records from the current disposable execution view. */
  readonly records: readonly TypedRecord[];
  /** Compiler-owned resolution from logical output identities to materialized Records. */
  readonly outputs: readonly { readonly output: string; readonly record: string }[];
};

export type NleProjectionObservedRef =
  | { readonly kind: "record"; readonly id: string }
  | { readonly kind: "logical-output"; readonly id: string };

/** Prepared independently of execution so a Host can include every package-requested output. */
export type NlePreparedSubjectProjection = {
  readonly ownerId: string;
  readonly subject: AuthorEditSubject;
  readonly module: ModuleRef;
  readonly declaration: string;
  readonly target?: { readonly id: string; readonly mapping: TemporalMap };
  readonly requiredOutputs: readonly string[];
  readonly inputs: Readonly<Record<string, NleProjectionObservedRef>>;
  readonly outputs: Readonly<Record<string, NleProjectionObservedRef>>;
};

/** Optional package adapter. A declaration may contribute zero, one or several independent projections. */
export type NleSubjectProjector = {
  readonly id: string;
  readonly module: ModuleRef;
  readonly declaration: string;
  readonly requirements: readonly NleProjectionValueRequirement[];
  readonly project: (context: NleSubjectProjectionContext) => NleSubjectProjection;
};

function projectorOwner(projector: Pick<NleSubjectProjector, "module" | "declaration">): string {
  return `${moduleKey(projector.module)}#${projector.declaration}`;
}

function assertIdentity(value: string, label: string): void {
  if (value.trim().length === 0 || value.includes("#")) throw new Error(`${label} is invalid.`);
}

export function assertNleSubjectProjection(value: NleSubjectProjection): void {
  assertIdentity(value.id, "NLE subject projection id");
  if (value.label.trim().length === 0) throw new Error("NLE subject projection label is empty.");
  const itemIds = new Set<string>();
  for (const item of value.items) {
    assertIdentity(item.id, "NLE temporal item id");
    if (itemIds.has(item.id)) throw new Error(`NLE subject projection repeats item ${item.id}.`);
    itemIds.add(item.id);
    if (item.label.trim().length === 0) throw new Error(`NLE temporal item ${item.id} label is empty.`);
    assertTemporalMapRegionSet(item.regions);
    const actionIds = new Set<string>();
    for (const action of item.actions) {
      assertIdentity(action.id, `NLE temporal item ${item.id} action id`);
      if (actionIds.has(action.id)) throw new Error(`NLE temporal item ${item.id} repeats action ${action.id}.`);
      actionIds.add(action.id);
      if (action.label.trim().length === 0 || action.authority.action.trim().length === 0
        || action.authority.declaration.trim().length === 0) {
        throw new Error(`NLE temporal item ${item.id} action ${action.id} has invalid authority.`);
      }
    }
  }
}

export class NleSubjectProjectorRegistry {
  readonly #projectors = new Map<string, NleSubjectProjector[]>();

  register(projector: NleSubjectProjector): void {
    assertIdentity(projector.id, "NLE subject projector id");
    if (projector.declaration.trim().length === 0) throw new Error("NLE subject projector declaration is empty.");
    const requirementIds = new Set<string>();
    for (const requirement of projector.requirements) {
      assertIdentity(requirement.id, "NLE subject projector requirement id");
      if (requirementIds.has(requirement.id)) {
        throw new Error(`NLE subject projector ${projector.id} repeats requirement ${requirement.id}.`);
      }
      requirementIds.add(requirement.id);
      if (requirement.from.name.trim().length === 0) {
        throw new Error(`NLE subject projector ${projector.id} has an empty requirement edge.`);
      }
    }
    const key = projectorOwner(projector);
    const existing = this.#projectors.get(key) ?? [];
    if (existing.some((candidate) => candidate.id === projector.id)) {
      throw new Error(`NLE subject projector ${key}#${projector.id} is already registered.`);
    }
    this.#projectors.set(key, [...existing, projector]);
  }

  resolve(module: ModuleRef, declaration: string): readonly NleSubjectProjector[] {
    return this.#projectors.get(projectorOwner({ module, declaration })) ?? [];
  }

  project(module: ModuleRef, declaration: string,
    request: NleSubjectProjectionRequest): readonly NleSubjectProjection[] {
    if (request.target !== undefined) assertTemporalMap(request.target.mapping);
    return this.resolve(module, declaration).map((projector) => {
      const values: Record<string, NleProjectionValue> = {};
      for (const requirement of projector.requirements) {
        const value = requirement.from.kind === "input"
          ? request.inputs[requirement.from.name] : request.outputs[requirement.from.name];
        if (value === undefined) {
          throw new Error(`NLE subject projector ${projector.id} requires ${requirement.from.kind} ${requirement.from.name}.`);
        }
        if (!sameType(value.type, requirement.type)) {
          throw new Error(`NLE subject projector ${projector.id} requirement ${requirement.id} has the wrong Type.`);
        }
        values[requirement.id] = value;
      }
      const projection = projector.project({
        ownerId: request.ownerId,
        subject: request.subject,
        values,
        ...(request.target === undefined ? {} : { target: request.target }),
      });
      assertNleSubjectProjection(projection);
      return projection;
    });
  }
}

function ownerProvenance(provenance: AuthorProvenance, owner: AuthorValueRef): AuthorElementProvenance {
  const matches = provenance.elements.filter((element) => owner.kind === "record"
    ? element.records.some((record) => record.id === owner.id)
    : element.outputs.some((output) => output.component === owner.component && output.name === owner.output));
  if (matches.length !== 1) throw new Error("NLE subject owner provenance is not unique.");
  return matches[0]!;
}

function ownerDocument(documents: readonly AuthorStructureDocument[],
  provenance: AuthorElementProvenance): AuthorStructureDocument {
  const matches = documents.filter((document) => document.source.id === provenance.source);
  if (matches.length !== 1) throw new Error(`NLE subject Source ${provenance.source} is not uniquely available.`);
  return matches[0]!;
}

function ownerDeclaration(document: AuthorStructureDocument,
  provenance: AuthorElementProvenance): AuthorStructureDeclarationNode {
  const matches = document.nodes.filter((node): node is AuthorStructureDeclarationNode =>
    node.kind === "declaration" && node.module !== undefined
    && node.range.start <= provenance.range.start && node.range.end >= provenance.range.end)
    .sort((left, right) => (left.range.end - left.range.start) - (right.range.end - right.range.start));
  if (matches.length === 0) throw new Error(`NLE subject declaration for ${provenance.id} is unavailable.`);
  const span = matches[0]!.range.end - matches[0]!.range.start;
  if (matches.filter((candidate) => candidate.range.end - candidate.range.start === span).length !== 1) {
    throw new Error(`NLE subject declaration for ${provenance.id} is not unique.`);
  }
  return matches[0]!;
}

function observedRef(provenance: AuthorProvenance, ref: AuthorValueRef): NleProjectionObservedRef {
  if (ref.kind === "record") return ref;
  const matches = provenance.elements.flatMap((element) => element.outputs)
    .filter((output) => output.component === ref.component && output.name === ref.output);
  if (matches.length !== 1) {
    throw new Error(`NLE projection input ${ref.component}.${ref.output} has no unique logical output.`);
  }
  return { kind: "logical-output", id: matches[0]!.id };
}

/**
 * Join one domain-resolved subject to its author declaration and projector requirements.
 * No execution values are inspected here; `requiredOutputs` can extend an interactive Build selection.
 */
export function prepareNleSubjectProjection(input: {
  readonly location: NleSubjectLocation;
  readonly documents: readonly AuthorStructureDocument[];
  readonly provenance: AuthorProvenance;
  readonly registry: Pick<NleSubjectProjectorRegistry, "resolve">;
}): NlePreparedSubjectProjection {
  if (input.location.target !== undefined) assertTemporalMap(input.location.target.mapping);
  const provenance = ownerProvenance(input.provenance, input.location.owner);
  const document = ownerDocument(input.documents, provenance);
  const declaration = ownerDeclaration(document, provenance);
  const projectors = input.registry.resolve(declaration.module!, declaration.name);
  const inputs: Record<string, NleProjectionObservedRef> = {};
  const outputs: Record<string, NleProjectionObservedRef> = {};
  const requiredOutputs = new Set<string>();
  for (const requirement of projectors.flatMap((projector) => projector.requirements)) {
    const destination = requirement.from.kind === "input" ? inputs : outputs;
    if (destination[requirement.from.name] !== undefined) continue;
    if (requirement.from.kind === "input") {
      const candidates = provenance.inputs.filter((candidate) => candidate.name === requirement.from.name);
      if (candidates.length !== 1 || candidates[0]!.ref === undefined) {
        throw new Error(`NLE projection requires exact input ${requirement.from.name} on ${declaration.name}.`);
      }
      const ref = observedRef(input.provenance, candidates[0]!.ref);
      destination[requirement.from.name] = ref;
      if (ref.kind === "logical-output") requiredOutputs.add(ref.id);
      continue;
    }
    const candidates = provenance.outputs.filter((candidate) => candidate.name === requirement.from.name);
    if (candidates.length !== 1) {
      throw new Error(`NLE projection requires exact output ${requirement.from.name} on ${declaration.name}.`);
    }
    const ref = { kind: "logical-output" as const, id: candidates[0]!.id };
    destination[requirement.from.name] = ref;
    requiredOutputs.add(ref.id);
  }
  return {
    ownerId: declaration.label ?? provenance.id,
    subject: { source: document.source.id, node: declaration.node },
    module: declaration.module!,
    declaration: declaration.name,
    ...(input.location.target === undefined ? {} : { target: input.location.target }),
    requiredOutputs: [...requiredOutputs].sort(),
    inputs,
    outputs,
  };
}

function observedValues(refs: Readonly<Record<string, NleProjectionObservedRef>>,
  observation: NleProjectionObservation): Readonly<Record<string, NleProjectionValue>> {
  const records = new Map<string, TypedRecord>();
  for (const record of observation.records) {
    if (records.has(record.id)) throw new Error(`NLE observation repeats Record ${record.id}.`);
    records.set(record.id, record);
  }
  const outputs = new Map<string, string>();
  for (const output of observation.outputs) {
    if (outputs.has(output.output)) throw new Error(`NLE observation repeats logical output ${output.output}.`);
    outputs.set(output.output, output.record);
  }
  return Object.fromEntries(Object.entries(refs).map(([name, ref]) => {
    const recordId = ref.kind === "record" ? ref.id : outputs.get(ref.id);
    if (recordId === undefined) throw new Error(`NLE observation has not resolved logical output ${ref.id}.`);
    const record = records.get(recordId);
    if (record === undefined) throw new Error(`NLE observation has no materialized Record ${recordId}.`);
    return [name, { type: record.type, value: record.value }];
  }));
}

/** Project a prepared subject from already materialized facts; this never starts provider execution. */
export function projectPreparedNleSubject(
  prepared: NlePreparedSubjectProjection,
  observation: NleProjectionObservation,
  registry: Pick<NleSubjectProjectorRegistry, "project">,
): readonly NleSubjectProjection[] {
  return registry.project(prepared.module, prepared.declaration, {
    ownerId: prepared.ownerId,
    subject: prepared.subject,
    inputs: observedValues(prepared.inputs, observation),
    outputs: observedValues(prepared.outputs, observation),
    ...(prepared.target === undefined ? {} : { target: prepared.target }),
  });
}

/** Convenience for Hosts that already have a complete execution observation. */
export function assembleNleSubjectProjection(input: {
  readonly location: NleSubjectLocation;
  readonly documents: readonly AuthorStructureDocument[];
  readonly provenance: AuthorProvenance;
  readonly observation: NleProjectionObservation;
  readonly registry: NleSubjectProjectorRegistry;
}): readonly NleSubjectProjection[] {
  const prepared = prepareNleSubjectProjection(input);
  return projectPreparedNleSubject(prepared, input.observation, input.registry);
}

export const nleSubjectProjectorFacetAbi = "hypit.nle-subject-projector@1";

export function createNleSubjectProjectorFacet(projector: NleSubjectProjector): Facet {
  return {
    abi: nleSubjectProjectorFacetAbi,
    address: `${projectorOwner(projector)}#${projector.id}`,
    implementation: projector,
  };
}

export function installNleSubjectProjectorFacets(
  facets: readonly Facet[],
  registry: Pick<NleSubjectProjectorRegistry, "register">,
): void {
  for (const facet of facets) {
    if (facet.abi !== nleSubjectProjectorFacetAbi) continue;
    registry.register(facet.implementation as NleSubjectProjector);
  }
}

/** Complete one projected command without changing its owner-selected subject or selector. */
export function nleProjectedActionInvocation(
  action: NleProjectedAction,
  input: Readonly<Record<string, CanonicalValue>> = {},
): AuthorActionInvocation {
  return {
    authority: structuredClone(action.authority),
    input: canonicalize({ ...input, ...action.preset }),
  };
}
