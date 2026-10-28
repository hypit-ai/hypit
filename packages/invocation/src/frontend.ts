import type { ResolvedSource } from "@hypit/source";

import type {
  InvocationSourceDocument,
  InvocationFrontend,
  InvocationFrontendRegistryLike,
} from "./types.js";

export class InvocationSourceError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "InvocationSourceError";
    this.code = code;
    this.subject = subject;
  }
}

function assert(condition: unknown, code: string, message: string, subject?: string): asserts condition {
  if (!condition) throw new InvocationSourceError(code, message, subject);
}

export class InvocationFrontendRegistry implements InvocationFrontendRegistryLike {
  readonly #frontends = new Map<string, InvocationFrontend>();

  register(frontend: InvocationFrontend): void {
    assert(frontend.id.trim().length > 0, "EMPTY_INVOCATION_FRONTEND", "Invocation Frontend id is empty");
    assert(!this.#frontends.has(frontend.id), "DUPLICATE_INVOCATION_FRONTEND",
      `${frontend.id} is already registered`, frontend.id);
    this.#frontends.set(frontend.id, frontend);
  }

  resolve(id: string): InvocationFrontend | undefined {
    return this.#frontends.get(id);
  }
}

export async function compileInvocationSource(
  source: ResolvedSource,
  frontends: InvocationFrontendRegistryLike,
): Promise<InvocationSourceDocument> {
  const frontend = frontends.resolve(source.frontend);
  assert(frontend !== undefined, "UNKNOWN_INVOCATION_FRONTEND",
    `Invocation Frontend ${source.frontend} is not registered`, source.frontend);
  return await frontend.decode(source.unit);
}
