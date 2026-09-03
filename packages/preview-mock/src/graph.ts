import type { CompiledGraph, Candidate, TypedRecord } from "@hypit/protocol";
import { findLogicalOutput, findCandidate, findOperation } from "@hypit/compiler-node";
import type { GraphValueRef, TypeRef } from "@hypit/protocol";

export type MockKind = "image" | "video" | "audio" | "semantic-take";
export type MockTarget = { readonly output: string; readonly candidate: Candidate; readonly kind: MockKind; readonly inputs: Readonly<Record<string, string>>; readonly durationSeconds?: number };

/**
 * The longest duration the author wrote anywhere in the graph: a SpeechDuration literal (a still's
 * length) or the `duration` port of a generation request (a Seedance take). Durations are author
 * literals, so the preview clock is known before anything runs.
 */
export function estimatedProgramDurationSeconds(graph: CompiledGraph, records: readonly TypedRecord[] = []): number | undefined {
  const values: unknown[] = [
    ...records.filter((item) => sameType(item.type, "@hypit/speech", "SpeechDuration")).map((item) => item.value),
    ...graph.candidates.filter((item) => sameType(item.type, "@hypit/speech", "SpeechDuration") && item.root.kind === "value")
      .map((item) => item.root.kind === "value" ? item.root.value.value : undefined),
  ];
  const durations = values.map(inlineNumber).filter((value): value is number => value !== undefined);
  for (const record of records) {
    const duration = requestDuration(record.value.kind === "inline" ? record.value.value : undefined);
    if (duration !== undefined) durations.push(duration);
  }
  return durations.length === 0 ? undefined : Math.max(...durations);
}

/** The `duration` port of a sealed generation request or draft; nothing else is read as a duration. */
function requestDuration(value: unknown): number | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const ports = (value as { readonly ports?: unknown }).ports;
  if (ports === null || typeof ports !== "object") return undefined;
  return inlineDuration((ports as Record<string, unknown>).duration);
}

function sameType(left: TypeRef | undefined, module: string, name: string): boolean {
  return left?.module.name === module && left.name === name;
}

function refType(graph: CompiledGraph, ref: GraphValueRef, records: readonly TypedRecord[] = []): TypeRef | undefined {
  if (ref.kind === "logical-output") return findLogicalOutput(graph, ref.id)?.type;
  if (ref.kind === "record") return records.find((item) => item.id === ref.id)?.type
    ?? graph.candidates.find((item) => item.root.kind === "value" && item.root.value.id === ref.id)?.type;
  const operation = findOperation(graph, ref.operation);
  if (operation === undefined) return undefined;
  return graph.candidates.find((item) => item.root.kind === "operation" && item.root.result.operation === ref.operation)?.type;
}

function firstRefOfType(graph: CompiledGraph, type: { module: string; name: string }, records: readonly TypedRecord[] = []): string | undefined {
  for (const output of graph.outputs) if (sameType(output.type, type.module, type.name)) return output.id;
  const record = records.find((item) => sameType(item.type, type.module, type.name));
  if (record !== undefined) return record.id;
  for (const operation of graph.operations) {
    for (const ref of Object.values(operation.inputs)) {
      if (sameType(refType(graph, ref), type.module, type.name)) {
        const id = logicalId(graph, ref);
        if (id !== undefined) return id;
      }
    }
  }
  return undefined;
}

function logicalId(graph: CompiledGraph, ref: GraphValueRef | undefined): string | undefined {
  if (ref === undefined) return undefined;
  if (ref.kind === "logical-output") return ref.id;
  if (ref.kind === "record") return ref.id;
  if (ref.kind !== "operation-result") return undefined;
  const candidate = graph.candidates.find((item) => item.root.kind === "operation" && item.root.result.operation === ref.operation);
  return candidate === undefined ? undefined : graph.outputs.find((output) => output.primary === candidate.id)?.id;
}

function inlineNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (value !== null && typeof value === "object" && "value" in value) return inlineNumber((value as { value?: unknown }).value);
  return undefined;
}

function recordValue(records: readonly TypedRecord[], id: string): unknown {
  const record = records.find((item) => item.id === id);
  return record?.value.kind === "inline" ? record.value.value : undefined;
}

function inlineDuration(value: unknown): number | undefined {
  const direct = inlineNumber(value);
  if (direct !== undefined) return direct;
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = inlineDuration(item);
      if (candidate !== undefined) return candidate;
    }
    return undefined;
  }
  if (value === null || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  for (const key of ["duration", "durationSec", "durationSeconds"]) {
    const candidate = inlineNumber(object[key]);
    if (candidate !== undefined) return candidate;
  }
  const ports = object.ports;
  if (ports !== null && typeof ports === "object") {
    const candidate = inlineDuration((ports as Record<string, unknown>).duration);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function operationForRef(graph: CompiledGraph, ref: GraphValueRef): ReturnType<typeof findOperation> {
  if (ref.kind === "operation-result") return findOperation(graph, ref.operation);
  if (ref.kind !== "logical-output") return undefined;
  const output = findLogicalOutput(graph, ref.id);
  const candidate = output === undefined ? undefined : findCandidate(graph, output.primary);
  return candidate?.root.kind === "operation" ? findOperation(graph, candidate.root.result.operation) : undefined;
}

/** Find a typed input reachable from one operation, without consulting unrelated graph branches. */
function refOfTypeInOperation(
  graph: CompiledGraph,
  operation: ReturnType<typeof findOperation>,
  type: { readonly module: string; readonly name: string },
  records: readonly TypedRecord[],
  seen = new Set<string>(),
): GraphValueRef | undefined {
  if (operation === undefined || seen.has(operation.id)) return undefined;
  seen.add(operation.id);
  const refs = Object.entries(operation.inputs).sort(([left], [right]) => {
    const priority = (name: string) => name === "duration" ? 0 : name === "policy" ? 1 : name === "program" ? 2 : 3;
    return priority(left) - priority(right);
  });
  for (const [, ref] of refs) {
    if (sameType(refType(graph, ref, records), type.module, type.name)) return ref;
    const nested = refOfTypeInOperation(graph, operationForRef(graph, ref), type, records, seen);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/** Resolve the duration belonging to one generation operation, without falling back to the first
 * duration in the graph: a SpeechDuration record, or the literal `duration` port of the request. */
function durationFromRef(
  graph: CompiledGraph,
  ref: GraphValueRef | undefined,
  records: readonly TypedRecord[],
  seen = new Set<string>(),
): number | undefined {
  if (ref === undefined) return undefined;
  if (ref.kind === "record") return inlineDuration(recordValue(records, ref.id));
  if (ref.kind === "logical-output") {
    const candidate = findLogicalOutput(graph, ref.id);
    if (candidate === undefined) return undefined;
    const primary = findCandidate(graph, candidate.primary);
    if (primary?.root.kind === "value") return inlineDuration(primary.root.value.value);
    if (primary?.root.kind === "operation") return durationFromRef(graph, primary.root.result, records, seen);
    return undefined;
  }
  if (seen.has(ref.operation)) return undefined;
  seen.add(ref.operation);
  const operation = findOperation(graph, ref.operation);
  if (operation === undefined) return undefined;
  for (const name of ["duration", "request", "draft"]) {
    const value = durationFromRef(graph, operation.inputs[name], records, seen);
    if (value !== undefined) return value;
  }
  for (const ref of Object.values(operation.inputs)) {
    const value = durationFromRef(graph, ref, records, seen);
    if (value !== undefined) return value;
  }
  return undefined;
}

function durationForTarget(graph: CompiledGraph, operation: ReturnType<typeof findOperation>, inputs: Readonly<Record<string, string>>, records: readonly TypedRecord[]): number | undefined {
  const direct = durationFromRef(graph, refOfTypeInOperation(graph, operation, { module: "@hypit/speech", name: "SpeechDuration" }, records) ?? operation?.inputs.duration, records);
  if (direct !== undefined) return direct;
  const durationId = inputs.duration;
  if (durationId !== undefined) {
    const candidate = graph.candidates.find((item) => item.root.kind === "value" && item.root.value.id === durationId)
      ?? graph.candidates.find((item) => graph.outputs.some((output) => output.id === durationId && output.primary === item.id));
    if (candidate?.root.kind === "value") return inlineDuration(candidate.root.value.value);
  }
  return undefined;
}

function mockInputs(graph: CompiledGraph, kind: MockKind, operation: ReturnType<typeof findOperation>, records: readonly TypedRecord[] = []): Readonly<Record<string, string>> {
  const refs = operation?.inputs ?? {};
  const byName = (name: string): string | undefined => logicalId(graph, refs[name]!);
  const byType = (module: string, name: string): string | undefined => {
    for (const ref of Object.values(refs)) {
      const id = logicalId(graph, ref);
      if (id !== undefined && sameType(refType(graph, ref, records), module, name)) return id;
    }
    return firstRefOfType(graph, { module, name }, records);
  };
  if (kind === "image") {
    const canvas = byName("canvas") ?? byType("@hypit/spatial", "CanvasSpace");
    return canvas === undefined ? {} : { canvas };
  }
  if (kind === "video") {
    const canvas = byName("canvas") ?? byType("@hypit/spatial", "CanvasSpace");
    const duration = byName("duration")
      ?? logicalId(graph, refOfTypeInOperation(graph, operation, { module: "@hypit/speech", name: "SpeechDuration" }, records));
    const clock = byName("clock") ?? byType("@hypit/program-space", "ProgramClock");
    return Object.fromEntries([["canvas", canvas], ["duration", duration], ["clock", clock]].filter((item): item is [string, string] => item[1] !== undefined));
  }
  if (kind === "audio") {
    const duration = byName("duration") ?? byType("@hypit/speech", "SpeechDuration");
    return duration === undefined ? {} : { duration };
  }
  const result: Record<string, string | undefined> = {};
  for (const name of ["narrative", "segment", "media", "policy"]) {
    const direct = byName(name);
    if (direct !== undefined) result[name] = direct;
  }
  result.policy ??= logicalId(graph, refOfTypeInOperation(graph, operation, { module: "@hypit/estimate", name: "SpeechEstimatePolicy" }, records));
  result.narrative ??= byType("@hypit/narrative", "Narrative");
  result.segment ??= byType("@hypit/narrative", "NarrativeExcerpt");
  result.media ??= byType("@hypit/media", "SynchronizedMedia");
  result.policy ??= byType("@hypit/estimate", "SpeechEstimatePolicy");
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined && value.length > 0)) as Readonly<Record<string, string>>;
}

export function findMockTargets(graph: CompiledGraph, targets?: readonly string[], records: readonly TypedRecord[] = []): readonly MockTarget[] {
  const selected = targets ?? graph.outputs.map((item) => item.id);
  const closure = new Set<string>();
  const visitOperation = (operationId: string): void => {
    const operation = findOperation(graph, operationId);
    if (operation === undefined) return;
    for (const ref of Object.values(operation.inputs)) {
      if (ref.kind === "logical-output") visitOutput(ref.id);
      else if (ref.kind === "operation-result") {
        const candidate = graph.candidates.find((item) => item.root.kind === "operation" && item.root.result.operation === ref.operation);
        const output = candidate === undefined ? undefined : graph.outputs.find((item) => item.primary === candidate.id);
        if (output !== undefined) visitOutput(output.id);
        else visitOperation(ref.operation);
      }
    }
  };
  const visitOutput = (id: string): void => {
    if (closure.has(id)) return;
    closure.add(id);
    const output = findLogicalOutput(graph, id);
    if (output === undefined) return;
    const candidate = findCandidate(graph, output.primary);
    if (candidate?.root.kind !== "operation") return;
    visitOperation(candidate.root.result.operation);
  };
  for (const id of selected) visitOutput(id);
  const result: MockTarget[] = [];
  for (const id of closure) {
    const output = findLogicalOutput(graph, id);
    if (output === undefined) continue;
    const candidate = findCandidate(graph, output.primary);
    if (candidate === undefined) continue;
    let resolved: MockKind | undefined;
    if (output.type.module.name === "@hypit/speech" && output.type.name === "SemanticTake") resolved = "semantic-take";
    else if (output.type.module.name === "@hypit/artifact" && output.type.name === "BlobArtifact" && candidate.root.kind === "operation") {
      const operation = findOperation(graph, candidate.root.result.operation);
      if (operation?.producer.module.name === "@hypit/media-pipeline") continue;
      const name = operation?.producer.name.toLowerCase() ?? "";
      if (name.includes("project-mux") || name === "mux" || name.includes("render-composition")) continue;
      resolved = operation?.producer.module.name === "@hypit/gpt-image" || name.includes("image") || name.includes("picture") ? "image"
        : name.includes("video") || name.includes("visual") || name.includes("media") ? "video"
        : name.includes("audio") || name.includes("speech") || name.includes("tts") || name.includes("wav") ? "audio" : undefined;
    }
    const operation = candidate.root.kind === "operation" ? findOperation(graph, candidate.root.result.operation) : undefined;
    if (resolved !== undefined) {
      const inputs = mockInputs(graph, resolved, operation, records);
      const durationSeconds = resolved === "video" ? durationForTarget(graph, operation, inputs, records) : undefined;
      result.push({ output: id, candidate, kind: resolved, inputs, ...(durationSeconds === undefined ? {} : { durationSeconds }) });
    }
  }
  return result;
}
