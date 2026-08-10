import type {
  CanonicalValue,
  Digest,
  InvokeProducerCommand,
  ProducerRef,
  StoredValue,
  TypeRef,
  TypedRecord,
  ValueSchema,
} from "@narratage/protocol";
import type {
  TypeValidatorHandler,
  TypeValidatorRegistrar,
} from "@narratage/validation";

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

/** Minimal structural port implemented by Node ProducerRegistry and any future compute Host. */
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

/**
 * What a module's Recipe looks like, and what writing one does.
 *
 * A Recipe's properties are decided by the code that reads them, which is
 * enough to compile a stylesheet and not enough for a tool to offer one. This
 * states the shape as data and pairs it with the same lowering the Surface
 * performs, so an editor can present a Recipe and see the result without
 * knowing which module it belongs to.
 *
 * `apply` returns values for the module's own Producer inputs. It is partial in
 * both directions — only the inputs a Recipe speaks for, and within those, only
 * the fields it owns — so `current` carries the rest, including media a
 * stylesheet can name but not contain.
 */
export type RecipeFacet = {
  /** The Surface this Recipe is written for, as named in the Manifest. */
  readonly surface: string;
  /** The properties an author may write, with their formats and bounds. */
  readonly schema: ValueSchema;
  /**
   * A complete Recipe that renders, for a tool that has to start somewhere.
   *
   * Every property the decoder requires, and nothing it does not: an author
   * writes the required ones and leaves the rest to the fallbacks the decoder
   * already holds, so a starting point that named all of them would be unlike
   * anything anyone writes.
   */
  readonly defaults: Readonly<Record<string, CanonicalValue>>;
  readonly apply: (
    properties: Readonly<Record<string, CanonicalValue>>,
    current: Readonly<Record<string, CanonicalValue>>,
  ) => Readonly<Record<string, CanonicalValue>>;
  /**
   * What every property actually comes to, given what has been written.
   *
   * A Recipe leaves most of itself unsaid, and what the decoder then uses is
   * knowable only to the decoder: some of it fixed, some computed from another
   * property, some inherited from a value the author did set. Reporting it is
   * how an editor can show a complete Recipe without inventing one — the
   * numbers shown are the ones that rendered, not a second opinion about them.
   *
   * Answers for every property the schema declares, in the vocabulary and shape
   * an author would write, and needs no media to do it.
   */
  readonly effective: (
    properties: Readonly<Record<string, CanonicalValue>>,
  ) => Readonly<Record<string, CanonicalValue>>;
};

/** Trusted deterministic implementation package; it selects no Provider or Runtime service. */
export type ComponentPackage = {
  readonly name: string;
  readonly producers?: readonly ProducerFacet[];
  readonly validators?: readonly TypeValidatorFacet[];
  readonly recipes?: readonly RecipeFacet[];
};
