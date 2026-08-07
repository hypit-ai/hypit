import {
  isDigest,
  recordDigest,
  resolveType,
  sealRecord,
  sealTypeValidationReceipt,
  validateStoredValue,
  verifyRecord,
  verifyRecordStructure,
} from "@narratage/core";
import type {
  Digest,
  ResolvedModuleClosure,
  StoredValue,
  TypeRef,
  TypeValidationReceipt,
  TypedRecord,
} from "@narratage/protocol";

function typeKey(type: TypeRef): string {
  return `${type.module.name}@${type.module.version}#${type.name}`;
}

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

export type TypeValidatorContext = {
  readonly type: TypeRef;
  readonly value: StoredValue;
};

export type TypeValidatorHandler = (
  context: TypeValidatorContext,
) => void | Promise<void>;

export type TypeValidatorRegistration = {
  readonly type: TypeRef;
  readonly implementationDigest: Digest;
  readonly handler: TypeValidatorHandler;
};

export interface TypeValidatorRegistryLike {
  resolve(type: TypeRef): TypeValidatorRegistration | undefined;
}

/** Mutable package-install seam. Type owners register refinements; Core stays type-agnostic. */
export interface TypeValidatorRegistrar {
  register(
    type: TypeRef,
    implementationDigest: Digest,
    handler: TypeValidatorHandler,
  ): void;
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
    this.#validators.set(key, { type, implementationDigest, handler });
  }

  resolve(type: TypeRef): TypeValidatorRegistration | undefined {
    return this.#validators.get(typeKey(type));
  }
}

export async function validateValue(
  closure: ResolvedModuleClosure,
  type: TypeRef,
  value: StoredValue,
  registry: TypeValidatorRegistryLike,
): Promise<TypeValidationReceipt | undefined> {
  const declaration = resolveType(closure, type);
  validateStoredValue(value, declaration.schema, `$validation.${typeKey(type)}`);
  if (declaration.validator === undefined) return undefined;
  const registration = registry.resolve(type);
  if (registration === undefined) {
    throw new TypeValidationError("MISSING_TYPE_VALIDATOR", `${typeKey(type)} validator is not registered`, typeKey(type));
  }
  if (!sameType(registration.type, type)) {
    throw new TypeValidationError(
      "TYPE_VALIDATOR_REGISTRATION_MISMATCH",
      `${typeKey(type)} registry returned another nominal Type`,
      typeKey(type),
    );
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
  return sealTypeValidationReceipt({
    type,
    recordDigest: recordDigest(type, value),
    validatorDigest: registration.implementationDigest,
  });
}

export async function admitRecord(
  closure: ResolvedModuleClosure,
  record: TypedRecord,
  registry: TypeValidatorRegistryLike,
): Promise<TypedRecord> {
  const {
    digest: _digest,
    validation: _validation,
    ...draft
  } = record;
  const unvalidated = sealRecord(draft);
  verifyRecordStructure(closure, unvalidated);
  const validation = await validateValue(closure, record.type, record.value, registry);
  const admitted = sealRecord({
    ...draft,
    ...(validation === undefined ? {} : { validation }),
  });
  verifyRecord(closure, admitted);
  return admitted;
}

export function createRecordAdmitter(
  registry: TypeValidatorRegistryLike,
): (closure: ResolvedModuleClosure, record: TypedRecord) => Promise<TypedRecord> {
  return async (closure, record) => await admitRecord(closure, record, registry);
}
