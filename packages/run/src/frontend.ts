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
  RunSourceUnitIdentity,
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
    sourceDigest: digestOf(source.text),
  };
}

function unitContent(unit: RunSourceUnitIdentity): Omit<RunSourceUnitIdentity, "id"> {
  return {
    format: "svml.run-source-unit@1",
    frontendRequest: unit.frontendRequest,
    frontend: unit.frontend,
    frontendDigest: unit.frontendDigest,
    sourceDigest: unit.sourceDigest,
    semanticDigest: unit.semanticDigest,
    authorSource: unit.authorSource,
    imports: [...unit.imports].sort((left, right) => left.as.localeCompare(right.as)),
  };
}

function closureContent(closure: RunSourceClosure): Omit<RunSourceClosure, "id"> {
  return {
    format: "svml.run-source-closure@1",
    entry: closure.entry,
    units: [...closure.units].sort((left, right) => left.id.localeCompare(right.id)),
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
  const unitWithoutId = {
    format: "svml.run-source-unit@1" as const,
    frontendRequest: prepared.header.using,
    frontend: frontend.id,
    frontendDigest: frontend.implementationDigest,
    sourceDigest: prepared.sourceDigest,
    semanticDigest: digestOf(decoded.document),
    authorSource: discovery.author.source,
    imports: [...discovery.imports].sort((left, right) => left.as.localeCompare(right.as)),
  };
  const unit: RunSourceUnitIdentity = { ...unitWithoutId, id: digestOf(unitWithoutId) };
  const closureWithoutId = {
    format: "svml.run-source-closure@1" as const,
    entry: unit.id,
    units: [unit],
  };
  const closure: RunSourceClosure = { ...closureWithoutId, id: digestOf(closureWithoutId) };
  verifyRunSourceClosure(closure);
  return { document: decoded.document, closure };
}

export function verifyRunSourceClosure(closure: RunSourceClosure): void {
  assert(closure.format === "svml.run-source-closure@1", "UNSUPPORTED_RUN_SOURCE_CLOSURE", "unsupported Run Source Closure");
  assert(isDigest(closure.id), "INVALID_RUN_SOURCE_CLOSURE_DIGEST", "Run Source Closure digest is invalid");
  const ids = new Set<string>();
  for (const unit of closure.units) {
    assert(unit.format === "svml.run-source-unit@1", "UNSUPPORTED_RUN_SOURCE_UNIT", "unsupported Run SourceUnit");
    assert(isDigest(unit.id) && unit.id === digestOf(unitContent(unit)), "RUN_SOURCE_UNIT_DIGEST_MISMATCH", `${unit.id} digest differs`);
    assert(!ids.has(unit.id), "DUPLICATE_RUN_SOURCE_UNIT", `Run Source Closure repeats ${unit.id}`);
    assert(isDigest(unit.frontendDigest), "INVALID_RUN_FRONTEND_DIGEST", `${unit.id} Frontend digest is invalid`);
    assert(isDigest(unit.sourceDigest), "INVALID_RUN_SOURCE_DIGEST", `${unit.id} source digest is invalid`);
    assert(isDigest(unit.semanticDigest), "INVALID_RUN_SEMANTIC_DIGEST", `${unit.id} semantic digest is invalid`);
    ids.add(unit.id);
  }
  assert(ids.has(closure.entry), "UNKNOWN_RUN_SOURCE_ENTRY", `Run Source entry ${closure.entry} is absent`);
  assert(closure.id === digestOf(closureContent(closure)), "RUN_SOURCE_CLOSURE_DIGEST_MISMATCH", "Run Source Closure digest differs");
}
