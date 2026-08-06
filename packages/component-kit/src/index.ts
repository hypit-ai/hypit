import type {
  CanonicalValue,
  Digest,
  InvokeProducerCommand,
  ProducerRef,
  StoredValue,
  TypeRef,
  TypedRecord,
} from "@svml/protocol";
import type {
  TypeValidatorHandler,
  TypeValidatorRegistrar,
} from "@svml/validation";

export type Awaitable<T> = T | Promise<T>;

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

/** Minimal structural port implemented by Node HostRegistry and any future compute Host. */
export interface ProducerRegistrar {
  registerProducer(
    producer: ProducerRef,
    implementationDigest: Digest,
    handler: ProducerHandler,
  ): void;
}

/** Enumerable deterministic Producer identity and its trusted implementation. */
export type ProducerFacet = {
  readonly producer: ProducerRef;
  readonly implementationDigest: Digest;
  readonly handler: ProducerHandler;
};

export function registerProducerFacets(
  registry: ProducerRegistrar,
  facets: readonly ProducerFacet[],
): void {
  for (const facet of facets) {
    registry.registerProducer(facet.producer, facet.implementationDigest, facet.handler);
  }
}

/** Enumerable validator identity. Package locks can bind this without serializing its handler. */
export type TypeValidatorFacet = {
  readonly type: TypeRef;
  readonly implementationDigest: Digest;
  readonly handler: TypeValidatorHandler;
};

export function registerTypeValidatorFacets(
  registry: TypeValidatorRegistrar,
  facets: readonly TypeValidatorFacet[],
): void {
  for (const facet of facets) {
    registry.register(facet.type, facet.implementationDigest, facet.handler);
  }
}

/** Trusted deterministic implementation package; it selects no Provider or Runtime service. */
export type ComponentPackage = {
  readonly name: string;
  readonly producers?: readonly ProducerFacet[];
  readonly validators?: readonly TypeValidatorFacet[];
};
