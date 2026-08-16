import type {
  CanonicalValue,
  InvokeProducerCommand,
  ProducerRef,
  StoredValue,
  TypeRef,
  TypedRecord,
} from "@narratage/protocol";

export type Awaitable<T> = T | Promise<T>;

export type TypeValidatorContext = {
  readonly type: TypeRef;
  readonly value: StoredValue;
};

export type TypeValidatorHandler = (
  context: TypeValidatorContext,
) => void | Promise<void>;

/** Minimal structural port implemented by a validation Host. */
export interface TypeValidatorRegistrar {
  register(
    type: TypeRef,
    handler: TypeValidatorHandler,
  ): void;
}

export type ProducerHandlerResult = {
  readonly outputs: Readonly<Record<string, StoredValue>>;
  readonly needs: Readonly<Record<string, CanonicalValue>>;
};

/**
 * Pure compute context. Artifact bytes, credentials, network and stores are deliberately absent;
 * those effects must cross an explicit Need into a Provider.
 */
export type ProducerHandlerContext = {
  readonly command: InvokeProducerCommand;
  readonly producer: ProducerRef;
  readonly inputs: Readonly<Record<string, TypedRecord>>;
};

export type ProducerHandler = (
  context: ProducerHandlerContext,
) => Awaitable<ProducerHandlerResult>;

/** Minimal structural port implemented by a Producer registry. */
export interface ProducerRegistrar {
  registerProducer(
    producer: ProducerRef,
    handler: ProducerHandler,
  ): void;
}

/** Enumerable deterministic Producer handler owned by its package. */
export type ProducerFacet = {
  readonly producer: ProducerRef;
  readonly handler: ProducerHandler;
};

export function registerProducerFacets(
  registry: ProducerRegistrar,
  facets: readonly ProducerFacet[],
): void {
  for (const facet of facets) {
    registry.registerProducer(facet.producer, facet.handler);
  }
}

/** Package-owned semantic validator. */
export type TypeValidatorFacet = {
  readonly type: TypeRef;
  readonly handler: TypeValidatorHandler;
};

export function registerTypeValidatorFacets(
  registry: TypeValidatorRegistrar,
  facets: readonly TypeValidatorFacet[],
): void {
  for (const facet of facets) {
    registry.register(facet.type, facet.handler);
  }
}

/** Trusted deterministic implementation package; it selects no Provider or Runtime infrastructure. */
export type ComponentPackage = {
  readonly producers?: readonly ProducerFacet[];
  readonly validators?: readonly TypeValidatorFacet[];
};
