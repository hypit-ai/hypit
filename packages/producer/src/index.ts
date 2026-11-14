import type { CanonicalValue, Value } from "@hypit/protocol";
import type { ProducerRef } from "@hypit/module";
import type { InvokeProducerCommand, TypedRecord } from "@hypit/generation-build";
import type { Facet } from "@hypit/facet";

export type Awaitable<T> = T | Promise<T>;

export type ProducerHandlerResult = {
  readonly kind: "output";
  readonly value: Value;
} | {
  readonly kind: "need";
  readonly constraints: CanonicalValue;
};

/** Host-owned limits for one deterministic Producer invocation. */
export type ProducerExecutionLimits = {
  /** Maximum canonical UTF-8 bytes the returned output Value or Need constraints may add to Build facts. */
  readonly maxInlineValueBytes: number;
};

/**
 * Pure compute context. Artifact bytes, credentials, network and stores are deliberately absent;
 * those effects must cross an explicit Need into a Provider.
 */
export type ProducerHandlerContext = {
  readonly command: InvokeProducerCommand;
  readonly inputs: Readonly<Record<string, TypedRecord>>;
  readonly limits: ProducerExecutionLimits;
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

/** Producer-owned deterministic implementations; it selects no Provider or Runtime infrastructure. */
export type ProducerPackage = readonly ProducerFacet[];

export const producerPackageFacetKind = "hypit.producer-package";

export type ProducerPackageFacet = Facet & {
  readonly kind: typeof producerPackageFacetKind;
  readonly implementation: ProducerPackage;
};

/** Convert one package's Producer-owned implementations into an opaque package Facet. */
export function createProducerPackageFacet(producers: ProducerPackage): ProducerPackageFacet {
  if (!Array.isArray(producers)) throw new Error("Producer package must be an array of Producer facets");
  return {
    kind: producerPackageFacetKind,
    implementation: producers,
  };
}

/** Select only Producer facets; package loading itself never interprets their implementation. */
export function producerPackagesFromFacets(facets: readonly Facet[]): readonly ProducerPackage[] {
  return facets.flatMap((facet) => facet.kind === producerPackageFacetKind
    ? [(facet as ProducerPackageFacet).implementation]
    : []);
}
