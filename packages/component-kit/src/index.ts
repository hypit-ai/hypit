import type {
  CanonicalValue,
  Digest,
  InvokeProducerCommand,
  ProducerRef,
  StoredValue,
  TypedRecord,
} from "@svml/protocol";
import type { TypeValidatorRegistrar } from "@svml/validation";

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

/** Trusted deterministic implementation package; it selects no Provider or Runtime service. */
export type ComponentPackage = {
  readonly name: string;
  install?(registry: ProducerRegistrar): Awaitable<void>;
  installValidators?(registry: TypeValidatorRegistrar): Awaitable<void>;
};
