import {
  resolveType,
  verifyRecordStructure,
} from "@hypit/core";
import type {
  TypeValidatorHandler,
  TypeValidatorRegistrar,
} from "@hypit/component-kit";
import type { ResolvedModuleClosure, StoredValue, TypeRef, TypedRecord } from "@hypit/protocol";

function typeKey(type: TypeRef): string {
  return `${type.module.name}@${type.module.version}#${type.name}`;
}

export type { TypeValidatorContext, TypeValidatorHandler, TypeValidatorRegistrar } from "@hypit/component-kit";

export type TypeValidatorRegistration = {
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
    handler: TypeValidatorHandler,
  ): void {
    const key = typeKey(type);
    if (this.#validators.has(key)) {
      throw new TypeValidationError("DUPLICATE_TYPE_VALIDATOR", `${key} validator is already registered`, key);
    }
    this.#validators.set(key, { handler });
  }

  resolve(type: TypeRef): TypeValidatorRegistration | undefined {
    return this.#validators.get(typeKey(type));
  }
}

async function refineValue(
  type: TypeRef,
  value: StoredValue,
  registry: TypeValidatorRegistryLike,
): Promise<void> {
  const registration = registry.resolve(type);
  if (registration === undefined) return;
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
  resolveType(closure, type);
  await refineValue(type, value, registry);
}

export async function admitRecord(
  closure: ResolvedModuleClosure,
  record: TypedRecord,
  registry: TypeValidatorRegistryLike,
): Promise<TypedRecord> {
  verifyRecordStructure(closure, record);
  await refineValue(record.type, record.value, registry);
  return record;
}

export function createRecordAdmitter(
  registry: TypeValidatorRegistryLike,
): (closure: ResolvedModuleClosure, record: TypedRecord) => Promise<void> {
  return async (closure, record) => {
    await admitRecord(closure, record, registry);
  };
}
