import {
  canonicalStringify,
  digestOf,
  isDigest,
} from "@narratage/protocol";
import {
  maskSourceHeader,
  parseSourceHeader,
} from "@narratage/source";

import type {
  RunDocument,
  RunFrontend,
  RunFrontendRegistryLike,
  RunFrontendSourceUnit,
  RunSourceClosure,
  RunSourceUnit,
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
    assert(isDigest(frontend.implementationDigest), "INVALID_RUN_FRONTEND_DIGEST", `${frontend.id} digest is invalid`);
    assert(!this.#frontends.has(frontend.id), "DUPLICATE_RUN_FRONTEND", `${frontend.id} is already registered`, frontend.id);
    this.#frontends.set(frontend.id, frontend);
  }

  resolve(id: string): RunFrontend | undefined {
    return this.#frontends.get(id);
  }
}

export function prepareRunSource(source: RunSourceUnit): RunFrontendSourceUnit {
  const header = parseSourceHeader(source.name, source.text);
  return {
    ...source,
    text: maskSourceHeader(source.text, header),
    header,
  };
}

function closureContent(closure: RunSourceClosure): Omit<RunSourceClosure, "id"> {
  return {
    format: "svml.run-source-closure@1",
    frontend: closure.frontend,
    frontendDigest: closure.frontendDigest,
    sourceDigest: closure.sourceDigest,
    semanticDigest: closure.semanticDigest,
  };
}

export async function compileRunSource(
  source: RunSourceUnit,
  frontends: RunFrontendRegistryLike,
): Promise<{ readonly document: RunDocument; readonly closure: RunSourceClosure }> {
  const prepared = prepareRunSource(source);
  const frontend = frontends.resolve(prepared.header.using);
  assert(frontend !== undefined, "UNKNOWN_RUN_FRONTEND", `Run Frontend ${prepared.header.using} is not registered`, prepared.header.using);
  assert(isDigest(frontend.implementationDigest), "INVALID_RUN_FRONTEND_DIGEST", `${frontend.id} digest is invalid`);
  const discovery = await frontend.discover(prepared);
  const decoded = await frontend.decode(prepared);
  assert(
    canonicalStringify(discovery.author) === canonicalStringify(decoded.document.author),
    "RUN_FRONTEND_DISCOVERY_DRIFT",
    `${frontend.id} changed the Author Source between discover and decode`,
  );
  assert(
    canonicalStringify(discovery.imports) === canonicalStringify(decoded.document.imports),
    "RUN_FRONTEND_DISCOVERY_DRIFT",
    `${frontend.id} changed imports between discover and decode`,
  );
  const closureWithoutId = {
    format: "svml.run-source-closure@1" as const,
    frontend: frontend.id,
    frontendDigest: frontend.implementationDigest,
    sourceDigest: digestOf(source.text),
    semanticDigest: digestOf(decoded.document),
  };
  const closure: RunSourceClosure = { ...closureWithoutId, id: digestOf(closureWithoutId) };
  verifyRunSourceClosure(closure);
  return { document: decoded.document, closure };
}

export function verifyRunSourceClosure(closure: RunSourceClosure): void {
  assert(closure.format === "svml.run-source-closure@1", "UNSUPPORTED_RUN_SOURCE_CLOSURE", "unsupported Run Source Closure");
  assert(closure.frontend.trim().length > 0, "EMPTY_RUN_FRONTEND", "Run Source Frontend is empty");
  assert(isDigest(closure.frontendDigest), "INVALID_RUN_FRONTEND_DIGEST", "Run Source Frontend digest is invalid");
  assert(isDigest(closure.sourceDigest), "INVALID_RUN_SOURCE_DIGEST", "Run Source digest is invalid");
  assert(isDigest(closure.semanticDigest), "INVALID_RUN_SEMANTIC_DIGEST", "Run Source semantic digest is invalid");
  assert(closure.id === digestOf(closureContent(closure)), "RUN_SOURCE_CLOSURE_DIGEST_MISMATCH", "Run Source Closure digest differs");
}
