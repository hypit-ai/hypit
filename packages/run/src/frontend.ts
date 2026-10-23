import type { ResolvedSource } from "@hypit/source";

import type {
  RunDocument,
  RunFrontend,
  RunFrontendRegistryLike,
} from "./types.js";

export class RunSourceError extends Error {
  readonly code: string;
  readonly subject: string | undefined;

  constructor(code: string, message: string, subject?: string) {
    super(message);
    this.name = "RunSourceError";
    this.code = code;
    this.subject = subject;
  }
}

function assert(condition: unknown, code: string, message: string, subject?: string): asserts condition {
  if (!condition) throw new RunSourceError(code, message, subject);
}

export class RunFrontendRegistry implements RunFrontendRegistryLike {
  readonly #frontends = new Map<string, RunFrontend>();

  register(frontend: RunFrontend): void {
    assert(frontend.id.trim().length > 0, "EMPTY_RUN_FRONTEND", "Run Frontend id is empty");
    assert(!this.#frontends.has(frontend.id), "DUPLICATE_RUN_FRONTEND", `${frontend.id} is already registered`, frontend.id);
    this.#frontends.set(frontend.id, frontend);
  }

  resolve(id: string): RunFrontend | undefined {
    return this.#frontends.get(id);
  }
}

export async function compileRunSource(
  source: ResolvedSource,
  frontends: RunFrontendRegistryLike,
): Promise<RunDocument> {
  const frontend = frontends.resolve(source.frontend);
  assert(frontend !== undefined, "UNKNOWN_RUN_FRONTEND", `Run Frontend ${source.frontend} is not registered`, source.frontend);
  return await frontend.decode(source.unit);
}
