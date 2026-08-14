import {
  isDigest,
  resolveType,
  sealRecord,
  validateStoredValue,
  verifyRecordStructure,
} from "@narratage/core";
import type {
  TypeValidatorContext,
  TypeValidatorHandler,
  TypeValidatorRegistrar,
} from "@narratage/component-kit";
import type {
  Digest,
  ResolvedModuleClosure,
  ResolvedTypeDeclaration,
  StoredValue,
  TypeRef,
  TypedRecord,
} from "@narratage/protocol";

function typeKey(type: TypeRef): string {
  return `${type.module.name}@${type.module.version}#${type.name}`;
}

export type { TypeValidatorContext, TypeValidatorHandler, TypeValidatorRegistrar } from "@narratage/component-kit";

export type TypeValidatorRegistration = {
  readonly implementationDigest: Digest;
  readonly handler: TypeValidatorHandler;
};

export interface TypeValidatorRegistryLike {
  resolve(type: TypeRef): TypeValidatorRegistration | undefined;
}

export class TypeValidationError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "TypeValidationError";
    this.code = code;
    this.subject = subject;
  }
}

export class TypeValidatorRegistry implements TypeValidatorRegistryLike, TypeValidatorRegistrar {
  readonly #validators = new Map<string, TypeValidatorRegistration>();

  register(
    type: TypeRef,
    implementationDigest: Digest,
    handler: TypeValidatorHandler,
  ): void {
    const key = typeKey(type);
    if (!isDigest(implementationDigest)) {
      throw new TypeValidationError("INVALID_TYPE_VALIDATOR_DIGEST", `${key} validator digest is invalid`, key);
    }
    if (this.#validators.has(key)) {
      throw new TypeValidationError("DUPLICATE_TYPE_VALIDATOR", `${key} validator is already registered`, key);
    }
    this.#validators.set(key, { implementationDigest, handler });
  }

  resolve(type: TypeRef): TypeValidatorRegistration | undefined {
    return this.#validators.get(typeKey(type));
  }
}

async function refineValue(
  declaration: ResolvedTypeDeclaration,
  type: TypeRef,
  value: StoredValue,
  registry: TypeValidatorRegistryLike,
): Promise<void> {
  if (declaration.validator === undefined) return;
  const registration = registry.resolve(type);
  if (registration === undefined) {
    throw new TypeValidationError("MISSING_TYPE_VALIDATOR", `${typeKey(type)} validator is not registered`, typeKey(type));
  }
  if (registration.implementationDigest !== declaration.validator.implementation.digest) {
    throw new TypeValidationError(
      "TYPE_VALIDATOR_IMPLEMENTATION_MISMATCH",
      `${typeKey(type)} validator does not match the locked Manifest`,
      typeKey(type),
    );
  }
  try {
    await registration.handler({ type: structuredClone(type), value: structuredClone(value) });
  } catch (error) {
    throw new TypeValidationError(
      "TYPE_REFINEMENT_REJECTED",
      `${typeKey(type)} rejected the value: ${error instanceof Error ? error.message : String(error)}`,
      typeKey(type),
    );
  }
}

export async function validateValue(
  closure: ResolvedModuleClosure,
  type: TypeRef,
  value: StoredValue,
  registry: TypeValidatorRegistryLike,
): Promise<void> {
  const declaration = resolveType(closure, type);
  validateStoredValue(value, declaration.schema, `$validation.${typeKey(type)}`);
  await refineValue(declaration, type, value, registry);
}

export async function admitRecord(
  closure: ResolvedModuleClosure,
  record: TypedRecord,
  registry: TypeValidatorRegistryLike,
): Promise<TypedRecord> {
  const {
    digest: _digest,
    ...draft
  } = record;
  const admitted = sealRecord(draft);
  const declaration = verifyRecordStructure(closure, admitted);
  await refineValue(declaration, record.type, record.value, registry);
  return admitted;
}

export function createRecordAdmitter(
  registry: TypeValidatorRegistryLike,
): (closure: ResolvedModuleClosure, record: TypedRecord) => Promise<TypedRecord> {
  return async (closure, record) => await admitRecord(closure, record, registry);
}
