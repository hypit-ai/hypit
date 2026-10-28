import { moduleKey, sameType, typeKey } from "@hypit/protocol";
import type { CanonicalValue, ModuleRef, TypeRef, Value } from "@hypit/protocol";

import type { AuthorDeclarationDraft } from "./declaration.js";
import type { AuthorDocumentImport } from "./document.js";
import type { Awaitable } from "./source.js";

export type AuthorValueOffer = {
  readonly type: TypeRef;
  readonly value: Value;
};

export type AuthorAdopterRef = {
  readonly module: ModuleRef;
  readonly name: string;
};

/** One already-offered Resource that the Host should place beside the Author source. */
export type AuthorResourcePlacement = {
  readonly resource: string;
  readonly to: string;
};

/** Syntax-neutral author material proposed by one explicitly selected package adopter. */
export type AuthorAdoptionPlan = {
  readonly imports: readonly AuthorDocumentImport[];
  readonly declarations: readonly AuthorDeclarationDraft[];
  readonly resources: readonly AuthorResourcePlacement[];
  /** Public binding expected after the edited Author source is compiled. */
  readonly result: string;
};

export type AuthorAdopter = {
  readonly ref: AuthorAdopterRef;
  readonly accepts: TypeRef;
  adopt(input: {
    readonly offer: AuthorValueOffer;
    readonly parameters: CanonicalValue;
  }): Awaitable<AuthorAdoptionPlan>;
};

function refKey(ref: AuthorAdopterRef): string {
  if (ref.name.trim().length === 0) throw new Error("Author adopter name must not be empty");
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export class AuthorAdopterRegistry {
  readonly #adopters = new Map<string, AuthorAdopter>();

  register(adopter: AuthorAdopter): void {
    const key = refKey(adopter.ref);
    if (this.#adopters.has(key)) throw new Error(`Author adopter ${key} is registered twice`);
    this.#adopters.set(key, adopter);
  }

  resolve(ref: AuthorAdopterRef): AuthorAdopter | undefined {
    return this.#adopters.get(refKey(ref));
  }

  /** Browse exact matches only. The caller must still select one explicit adopter ref. */
  forType(type: TypeRef): readonly AuthorAdopter[] {
    return [...this.#adopters.values()].filter((adopter) => sameType(adopter.accepts, type));
  }

  async adopt(
    ref: AuthorAdopterRef,
    offer: AuthorValueOffer,
    parameters: CanonicalValue,
  ): Promise<AuthorAdoptionPlan> {
    const adopter = this.resolve(ref);
    if (adopter === undefined) throw new Error(`Author adopter ${refKey(ref)} is not installed`);
    if (!sameType(adopter.accepts, offer.type)) {
      throw new Error(`Author adopter ${refKey(ref)} accepts ${typeKey(adopter.accepts)}, not ${typeKey(offer.type)}`);
    }
    const plan = await adopter.adopt({ offer, parameters });
    if (plan.result.trim().length === 0) throw new Error(`Author adopter ${refKey(ref)} returned no result binding`);
    if (plan.declarations.length === 0) throw new Error(`Author adopter ${refKey(ref)} returned no declarations`);
    return plan;
  }
}
