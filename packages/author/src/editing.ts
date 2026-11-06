import type { Facet } from "@hypit/facet";
import { moduleKey, type CanonicalValue, type ModuleRef, type ValueSchema } from "@hypit/protocol";

import type {
  AuthorStructureDocument,
  AuthorStructureNodeId,
  AuthorStructureOperation,
} from "./structural-document.js";

export type AuthorEditSubject = {
  readonly source: string;
  readonly node: AuthorStructureNodeId;
};

/** Exact owner of one semantic authoring action. A projection never acquires this authority implicitly. */
export type AuthorActionAuthority = {
  readonly module: ModuleRef;
  readonly declaration: string;
  readonly action: string;
  readonly subject: AuthorEditSubject;
};

export type AuthorActionInvocation = {
  readonly authority: AuthorActionAuthority;
  readonly input: CanonicalValue;
};

export type AuthorEditPlanContext = {
  readonly document: AuthorStructureDocument;
  /** Absent for owner-defined creation commands. */
  readonly subject?: AuthorEditSubject;
};

export type AuthorEditAction = {
  readonly name: string;
  readonly summary: string;
  /** Package-owned, transport-neutral action input contract. */
  readonly input: ValueSchema;
  readonly plan: (
    context: AuthorEditPlanContext,
    input: CanonicalValue,
  ) => readonly AuthorStructureOperation[];
};

/** Package-owned commands for one logical declaration; action names are never centrally enumerated. */
export type AuthorEditPlanner = {
  readonly module: ModuleRef;
  readonly declaration: string;
  readonly actions: readonly AuthorEditAction[];
};

function plannerKey(module: ModuleRef, declaration: string): string {
  return `${moduleKey(module)}#${declaration}`;
}

export class AuthorEditPlannerRegistry {
  readonly #planners = new Map<string, AuthorEditPlanner>();

  register(planner: AuthorEditPlanner): void {
    if (planner.declaration.trim().length === 0 || planner.actions.length === 0) {
      throw new Error("Author Edit Planner has no declaration or actions.");
    }
    const names = new Set<string>();
    for (const action of planner.actions) {
      if (action.name.trim().length === 0 || action.summary.trim().length === 0 || names.has(action.name)) {
        throw new Error(`${plannerKey(planner.module, planner.declaration)} has an invalid or duplicate edit action.`);
      }
      names.add(action.name);
    }
    const key = plannerKey(planner.module, planner.declaration);
    if (this.#planners.has(key)) throw new Error(`Author Edit Planner ${key} is already registered.`);
    this.#planners.set(key, planner);
  }

  resolve(module: ModuleRef, declaration: string): AuthorEditPlanner | undefined {
    return this.#planners.get(plannerKey(module, declaration));
  }
}

/** Resolve an explicitly delegated action back to its owning declaration planner. */
export function planAuthorActionInvocation(
  registry: Pick<AuthorEditPlannerRegistry, "resolve">,
  document: AuthorStructureDocument,
  invocation: AuthorActionInvocation,
): readonly AuthorStructureOperation[] {
  const { authority } = invocation;
  if (authority.subject.source !== document.source.id) {
    throw new Error(`Author action subject belongs to ${authority.subject.source}, not ${document.source.id}.`);
  }
  const planner = registry.resolve(authority.module, authority.declaration);
  if (planner === undefined) {
    throw new Error(`Author action owner ${plannerKey(authority.module, authority.declaration)} is unavailable.`);
  }
  const action = planner.actions.find((candidate) => candidate.name === authority.action);
  if (action === undefined) {
    throw new Error(`Author action ${plannerKey(authority.module, authority.declaration)}#${authority.action} is unavailable.`);
  }
  return action.plan({ document, subject: authority.subject }, invocation.input);
}

export const authorEditPlannerFacetAbi = "hypit.author-edit-planner@1";

export function createAuthorEditPlannerFacet(planner: AuthorEditPlanner): Facet {
  return {
    abi: authorEditPlannerFacetAbi,
    address: plannerKey(planner.module, planner.declaration),
    implementation: planner,
  };
}

export function installAuthorEditPlannerFacets(
  facets: readonly Facet[],
  registry: Pick<AuthorEditPlannerRegistry, "register">,
): void {
  for (const facet of facets) {
    if (facet.abi !== authorEditPlannerFacetAbi) continue;
    registry.register(facet.implementation as AuthorEditPlanner);
  }
}
