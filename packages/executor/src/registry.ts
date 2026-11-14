import type { ProducerRegistrar } from "@hypit/producer";
import type { ProducerRef } from "@hypit/module";
import { producerIdentity, producerKey } from "@hypit/module";

import type { ProducerHandler } from "./types.js";

/** Generation Producer implementations selected for one Executor. */
export class ProducerRegistry implements ProducerRegistrar {
  readonly #producers = new Map<string, ProducerHandler>();

  registerProducer(producer: ProducerRef, handler: ProducerHandler): void {
    const identity = producerIdentity(producer);
    const display = producerKey(producer);
    if (this.#producers.has(identity)) throw new Error(`producer ${display} is already registered`);
    this.#producers.set(identity, handler);
  }

  producer(ref: ProducerRef): ProducerHandler | undefined {
    return this.#producers.get(producerIdentity(ref));
  }
}
