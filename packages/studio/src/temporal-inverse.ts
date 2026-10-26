import { isAbsolute, relative, resolve } from "node:path";

import type { ProducerStep, Value, TypedRecord } from "@hypit/hypit/protocol";
import { sameType } from "@hypit/hypit/protocol";
import { temporalTypes } from "@hypit/temporal";
import type { FrameSpan } from "@hypit/timeline";
import type {
  StudioSourceBinding,
  StudioTemporalConstraint,
  StudioTemporalInstantProjection,
  StudioTemporalRelationValue,
} from "@hypit/studio-companion";

import type { Placement } from "./observe.js";
import type { StudioSourceFile } from "./parameters.js";
import { executedTemporalProjection } from "./temporal-graph.js";
import type { ExecutedGraph } from "./temporal-graph.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";

type TemporalAuthor = {
  readonly binding?: unknown;
  readonly relation?: unknown;
};

export type TemporalSourceWrite = {
  readonly source: StudioSourceBinding["source"];
  readonly replacement: string;
};

function valueOf(value: Value): unknown | undefined {
  return value;
}

function recordIndex(state: ExecutedGraph): ReadonlyMap<string, TypedRecord> {
  return new Map([...state.program.records, ...state.records].map((record) => [record.id, record] as const));
}

function producerIndex(state: ExecutedGraph): ReadonlyMap<string, ProducerStep> {
  return new Map(state.plan.steps
    .filter((step) => step.result.kind === "output")
    .map((step) => [step.result.record, step] as const));
}

type AuthorElement = {
  readonly sourcePath: string;
  readonly authorEndpoints: Readonly<Record<string, string>>;
  readonly records: readonly string[];
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly references: Readonly<Record<string, string>>;
  readonly attributeValueRanges: Readonly<Record<string, { readonly start: number; readonly end: number }>>;
};

function authorElements(placements: readonly Placement[]): readonly AuthorElement[] {
  return placements.flatMap((placement): readonly AuthorElement[] => [{
    sourcePath: placement.sourcePath,
    authorEndpoints: placement.authorEndpoints ?? {},
    records: placement.records,
    attributes: placement.attributes,
    references: placement.referenceAttributes,
    attributeValueRanges: placement.attributeValueRanges,
  }, ...placement.children.map((child) => ({
    sourcePath: child.sourcePath,
    authorEndpoints: child.authorEndpoints ?? {},
    records: child.records ?? [],
    attributes: child.attributes,
    references: child.referenceAttributes,
    attributeValueRanges: child.attributeValueRanges,
  }))]);
}

function absolute(root: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(root, path);
}

/**
 * Resolve author parameters by the exact executed Spec record that owns them.
 * A consumer and a referenced declaration may use the same vocabulary word;
 * the Spec identity keeps those writes distinct.
 */
export function temporalAuthorBindings(input: {
  readonly state: ExecutedGraph;
  readonly rootRecord: string;
  readonly workspaceRoot: string;
  readonly placements: readonly Placement[];
  readonly files: readonly StudioSourceFile[];
}): readonly StudioSourceBinding[] {
  const records = recordIndex(input.state);
  const producers = producerIndex(input.state);
  const elements = authorElements(input.placements);
  const files = new Map(input.files.map((file) => [absolute(input.workspaceRoot, file.path), file] as const));
  const reached = new Set<string>();
  const bindings = new Map<string, StudioSourceBinding>();
  const collect = (recordId: string): void => {
    const held = records.get(recordId);
    const spec = held === undefined ? undefined : valueOf(held.value) as { readonly author?: TemporalAuthor } | undefined;
    const binding = typeof spec?.author?.binding === "string" ? spec.author.binding : undefined;
    if (binding === undefined) return;
    const owner = `${recordId}:${binding}`;
    const candidates = elements.filter((element) => element.records.includes(recordId)
      && element.authorEndpoints[binding] !== undefined);
    if (candidates.length !== 1) return;
    const element = candidates[0]!;
    const range = element.attributeValueRanges[binding];
    const endpoint = element.authorEndpoints[binding];
    const file = files.get(absolute(input.workspaceRoot, element.sourcePath));
    if (range === undefined || endpoint === undefined || file === undefined || element.references[binding] !== undefined) return;
    bindings.set(owner, {
      id: owner,
      binding: owner,
      name: binding,
      value: element.attributes[binding] as import("@hypit/hypit/protocol").CanonicalValue,
      language: file.language,
      writable: true,
      source: {
        endpoint,
        path: relative(input.workspaceRoot, absolute(input.workspaceRoot, element.sourcePath)),
        range,
        preimage: file.text.slice(range.start, range.end),
      },
    });
  };
  const visit = (recordId: string): void => {
    if (reached.has(recordId)) return;
    reached.add(recordId);
    collect(recordId);
    const step = producers.get(recordId);
    if (step === undefined) return;
    for (const upstream of Object.values(step.inputs)) visit(upstream);
  };
  visit(input.rootRecord);
  return [...bindings.values()];
}

/**
 * Deterministically invert the executed Temporal relations used by an Item.
 * The returned writes are one atomic author decision. Non-injective or opaque
 * relations deliberately produce no plan instead of guessing an owner.
 */
export function planTemporalInverse(input: {
  readonly state: ExecutedGraph;
  readonly rootRecord: string;
  readonly target: { readonly kind: "instant"; readonly frame: number }
    | (FrameSpan & { readonly kind: "window" });
  readonly bindings: readonly StudioSourceBinding[];
  readonly domainFrame: (projection: StudioTemporalInstantProjection) => number | undefined;
  readonly identify?: Parameters<typeof executedTemporalProjection>[2];
  readonly registry?: StudioCompanionRegistry;
}): readonly TemporalSourceWrite[] {
  const records = recordIndex(input.state);
  const producers = producerIndex(input.state);
  const sources = new Map(input.bindings.map((binding) => [binding.binding, binding.source] as const));
  const sameConstraint = (left: StudioTemporalConstraint, right: StudioTemporalConstraint): boolean =>
    left.kind === right.kind && (left.kind === "instant" && right.kind === "instant"
      ? left.frame === right.frame
      : left.kind === "extent" && right.kind === "extent"
        ? left.frameCount === right.frameCount
        : left.kind === "span" && right.kind === "span"
          ? left.startFrame === right.startFrame && left.endFrameExclusive === right.endFrameExclusive
          : false);
  const root = records.get(input.rootRecord);
  if (root === undefined) throw new Error(`Temporal inverse cannot find ${input.rootRecord}.`);
  type Candidate = {
    readonly desired: Map<string, StudioTemporalConstraint>;
    readonly queue: string[];
    readonly writes: Map<string, TemporalSourceWrite>;
  };
  const constrain = (candidate: Candidate, record: string, target: StudioTemporalConstraint): boolean => {
    const previous = candidate.desired.get(record);
    if (previous !== undefined) return sameConstraint(previous, target);
    candidate.desired.set(record, target);
    candidate.queue.push(record);
    return true;
  };
  const initial: Candidate = { desired: new Map(), queue: [], writes: new Map() };
  if (input.target.kind === "instant") {
    if (!sameType(root.type, temporalTypes.instant)) throw new Error("Temporal inverse expected an Instant record.");
    constrain(initial, root.id, input.target);
  } else {
    if (!sameType(root.type, temporalTypes.window)) throw new Error("Temporal inverse expected a Window record.");
    constrain(initial, root.id, { kind: "span", startFrame: input.target.startFrame,
      endFrameExclusive: input.target.endFrameExclusive });
  }

  const write = (candidate: Candidate, owner: string, replacement: string): boolean => {
    const source = sources.get(owner);
    if (source === undefined) return false;
    const key = source.endpoint ?? `${source.path}:${source.range.start}:${source.range.end}`;
    const previous = candidate.writes.get(key);
    if (previous !== undefined) return previous.replacement === replacement;
    candidate.writes.set(key, { source, replacement });
    return true;
  };

  const clone = (candidate: Candidate): Candidate => ({
    desired: new Map(candidate.desired), queue: [...candidate.queue], writes: new Map(candidate.writes),
  });
  const solve = (candidate: Candidate): readonly Candidate[] => {
    if (candidate.queue.length === 0) return [candidate];
    const recordId = candidate.queue.shift()!;
    const target = candidate.desired.get(recordId)!;
    const record = records.get(recordId);
    const step = producers.get(recordId);
    if (record === undefined) throw new Error(`Temporal inverse cannot read ${recordId}.`);
    const raw = valueOf(record.value) as {
      readonly frame?: unknown; readonly frameCount?: unknown;
      readonly startFrame?: unknown; readonly endFrameExclusive?: unknown;
      readonly span?: { readonly startFrame?: unknown; readonly endFrameExclusive?: unknown };
    } | undefined;
    const current = (): StudioTemporalConstraint | undefined => {
      if (Number.isSafeInteger(raw?.frame)) return { kind: "instant", frame: raw!.frame as number };
      const heldSpan = Number.isSafeInteger(raw?.startFrame) && Number.isSafeInteger(raw?.endFrameExclusive)
        ? raw : raw?.span;
      if (Number.isSafeInteger(heldSpan?.startFrame) && Number.isSafeInteger(heldSpan?.endFrameExclusive)) {
        return { kind: "span", startFrame: heldSpan!.startFrame as number,
          endFrameExclusive: heldSpan!.endFrameExclusive as number };
      }
      if (Number.isSafeInteger(raw?.frameCount)) return { kind: "extent", frameCount: raw!.frameCount as number };
      return undefined;
    };
    if (step === undefined) {
      const held = current();
      return held === undefined || !sameConstraint(held, target) ? [] : solve(candidate);
    }
    const outputName = step.result.kind === "output" && step.result.record === recordId
      ? step.result.name
      : undefined;
    const relation = outputName === undefined ? undefined : input.registry?.temporalRelationFor(step.producer, outputName);
    if (relation !== undefined) {
      const relationValue = (id: string): StudioTemporalRelationValue => {
        const found = records.get(id);
        if (found === undefined) throw new Error(`Temporal relation ${relation.id} cannot read ${id}.`);
        return { record: id, type: found.type, value: valueOf(found.value) };
      };
      const plans = relation.invert({
        target,
        output: relationValue(recordId),
        inputs: Object.fromEntries(Object.entries(step.inputs).map(([name, id]) => [name, relationValue(id)])),
        desired: (name) => {
          const id = step.inputs[name];
          return id === undefined ? undefined : candidate.desired.get(id);
        },
      });
      if (plans.length > 0) {
        return plans.flatMap((plan): readonly Candidate[] => {
          const branch = clone(candidate);
          for (const child of plan.constraints ?? []) {
            const record = step.inputs[child.input];
            if (record === undefined) throw new Error(`Temporal relation ${relation.id} names missing input ${child.input}.`);
            if (!constrain(branch, record, child.target)) return [];
          }
          for (const change of plan.writes ?? []) {
            const record = step.inputs[change.input];
            if (record === undefined) throw new Error(`Temporal relation ${relation.id} names missing input ${change.input}.`);
            if (!write(branch, `${record}:${change.binding}`, change.replacement)) return [];
          }
          return solve(branch);
        });
      }
    }
    const projection = target.kind === "instant"
      ? executedTemporalProjection(input.state, recordId, input.identify,
          (producer, output) => input.registry?.temporalRelationFor(producer, output)) : undefined;
    if (target.kind === "instant" && projection?.kind === "instant" && projection.authority.kind === "domain") {
      return input.domainFrame(projection) !== target.frame ? [] : solve(candidate);
    }
    const held = current();
    return held === undefined || !sameConstraint(held, target) ? [] : solve(candidate);
  };
  const key = (candidate: Candidate): string => [...candidate.writes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, write]) => `${JSON.stringify(source)}:${JSON.stringify(write.replacement)}`).join("\n");
  const solutions = new Map<string, Candidate>();
  for (const candidate of solve(initial)) solutions.set(key(candidate), candidate);
  if (solutions.size === 0) throw new Error("Temporal relation graph has no author inverse for the requested edit.");
  if (solutions.size > 1) throw new Error("Temporal relation graph has multiple distinct author inverses for the requested edit.");
  return [...[...solutions.values()][0]!.writes.values()]
    .filter((candidate) => candidate.replacement !== candidate.source.preimage)
    .sort((left, right) => left.source.path.localeCompare(right.source.path)
      || left.source.range.start - right.source.range.start
      || left.source.range.end - right.source.range.end);
}
