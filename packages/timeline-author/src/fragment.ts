import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation, FragmentOperationRef, GraphFragment } from "@hypit/hypit/author";
import type { TypeRef } from "@hypit/hypit/protocol";
import { temporalTypes } from "@hypit/temporal";
import type { TemporalDuration } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { timelineAuthorProducers, timelineAuthorTypes } from "./manifest.js";
import type { TimelineAuthorBinding, TimelineAuthorDeclaration, TimelineAuthorFragmentOptions } from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string): FragmentOperationRef => ({ kind: "fragment-operation", operation: id });

export type TimelineAuthorInlineInput = {
  readonly name: string;
  readonly type: TypeRef;
  readonly value: unknown;
  readonly author?: TimelineAuthorBinding;
};

export type TimelineAuthorFragmentPlan = {
  readonly fragment: GraphFragment;
  readonly inlineInputs: readonly TimelineAuthorInlineInput[];
  readonly extentInputs: readonly { readonly name: string; readonly declarationId: string }[];
  readonly outputNames: readonly { readonly port: string; readonly suffix: string }[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function divisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function parseDuration(value: string, label: string): TemporalDuration {
  const match = /^(\d+)(?:\.(\d+))?(f|ms|s)$/u.exec(value.trim());
  if (match === null) throw new Error(`${label} must be an exact duration such as 12f, 250ms or 1.5s.`);
  const whole = Number(match[1]);
  const fraction = match[2] ?? "";
  const unit = match[3];
  if (!Number.isSafeInteger(whole)) throw new Error(`${label} is outside safe arithmetic.`);
  if (unit === "f" || unit === "ms") {
    if (fraction.length > 0) throw new Error(`${label} ${unit} duration must be an integer.`);
    return { unit: unit === "f" ? "frames" : "milliseconds", value: whole };
  }
  const scale = 10 ** fraction.length;
  const numerator = whole * scale + (fraction.length === 0 ? 0 : Number(fraction));
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(scale)) {
    throw new Error(`${label} is outside safe arithmetic.`);
  }
  const gcd = divisor(numerator, scale);
  return { unit: "seconds", numerator: numerator / gcd, denominator: scale / gcd };
}

function splitTopLevel(value: string, separator: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === separator && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
    assert(depth >= 0, `Timeline expression has an unmatched parenthesis: ${value}`);
  }
  assert(depth === 0, `Timeline expression has an unmatched parenthesis: ${value}`);
  result.push(value.slice(start).trim());
  return result;
}

function splitOffset(expression: string): { readonly base: string; readonly direction?: 1 | -1; readonly duration?: string } {
  const value = expression.trim();
  let depth = 0;
  for (let index = value.length - 1; index > 0; index -= 1) {
    const char = value[index];
    if (char === ")") depth += 1;
    else if (char === "(") depth -= 1;
    else if (depth === 0 && (char === "+" || char === "-")) {
      const duration = value.slice(index + 1).trim();
      if (/^\d+(?:\.\d+)?(?:f|ms|s)$/u.test(duration)) {
        return { base: value.slice(0, index).trim(), direction: char === "+" ? 1 : -1, duration };
      }
    }
  }
  return { base: value };
}

export function compileTimelineAuthorFragment(options: TimelineAuthorFragmentOptions): TimelineAuthorFragmentPlan {
  const declarations = new Map<string, TimelineAuthorDeclaration>();
  const reserved = new Set(["start", "end", "timeline", "window"]);
  for (const declaration of options.declarations) {
    assert(!reserved.has(declaration.id), `Timeline declaration ${declaration.id} uses a reserved name.`);
    assert(!declarations.has(declaration.id), `Timeline repeats declaration ${declaration.id}.`);
    declarations.set(declaration.id, declaration);
  }

  const inputs: Array<{ name: string; type: TypeRef }> = [
    { name: "header", type: timelineAuthorTypes.header },
    { name: "clock", type: timelineTypes.clock },
  ];
  const operations: FragmentOperation[] = [];
  const inlineInputs: TimelineAuthorInlineInput[] = [];
  const extentInputs: { name: string; declarationId: string }[] = [];
  const created = new Set<string>();
  let generated = 0;

  const addOperation = (value: FragmentOperation): FragmentOperationRef => {
    if (!created.has(value.id)) {
      created.add(value.id);
      operations.push(value);
    }
    return operation(value.id);
  };
  const addInline = (type: TypeRef, value: unknown, stem: string, author?: TimelineAuthorBinding): ReturnType<typeof input> => {
    const name = `${stem}-${++generated}`;
    inputs.push({ name, type });
    inlineInputs.push({ name, type, value, ...(author === undefined ? {} : { author }) });
    return input(name);
  };
  const identitySpec = (id: string, subjectId = id) =>
    addInline(timelineAuthorTypes.identity, { id, subjectId }, "identity");
  const originRef = (): FragmentOperationRef => addOperation({
    id: "point:start", producer: timelineAuthorProducers.origin,
    inputs: { clock: input("clock") }, result: { kind: "output" as const, name: "point" },
  });
  const durationExtent = (raw: string, author?: TimelineAuthorBinding): FragmentOperationRef => {
    const duration = parseDuration(raw, "Timeline construction duration");
    const durationInput = addInline(timelineAuthorTypes.duration,
      { duration, ...(author === undefined ? {} : { author }) }, "duration", author);
    return addOperation({ id: `extent:duration:${generated}`, producer: timelineAuthorProducers.duration,
      inputs: { clock: input("clock"), duration: durationInput }, result: { kind: "output" as const, name: "extent" } });
  };
  const resolvedExtent = (declarationId: string, name: string): FragmentOperationRef => {
    if (!extentInputs.some((item) => item.name === name)) {
      inputs.push({ name, type: temporalTypes.extent });
      extentInputs.push({ name, declarationId });
    }
    const resolution = addInline(timelineAuthorTypes.resolution, { policy: "cover" }, "extent-resolution");
    return addOperation({ id: `decl:${declarationId}:extent`, producer: timelineAuthorProducers.resolvedExtent,
      inputs: { clock: input("clock"), extent: input(name), resolution },
      result: { kind: "output" as const, name: "extent" } });
  };
  const declarationExtent = (declaration: Extract<TimelineAuthorDeclaration, { readonly kind: "window" }>): FragmentOperationRef => {
    if (declaration.duration !== undefined) return durationExtent(declaration.duration,
      { binding: "for", declarationId: declaration.id });
    assert(declaration.extentInput !== undefined, `Timeline Window ${declaration.id} requires for.`);
    return resolvedExtent(declaration.id, declaration.extentInput);
  };
  const spanRef = (id: string): FragmentOperationRef => operation(`decl:${id}:span`);
  const instantRef = (id: string): FragmentOperationRef => operation(`decl:${id}:point`);
  const boundaryRef = (id: string, boundary: "start" | "end"): FragmentOperationRef => {
    const declaration = declarations.get(id);
    assert(declaration !== undefined, `Timeline expression references unknown declaration ${id}.`);
    assert(declaration.kind === "window", `Timeline Instant ${id} has no ${boundary} boundary.`);
    return addOperation({ id: `decl:${id}:${boundary}`,
      producer: boundary === "start" ? timelineAuthorProducers.spanStart : timelineAuthorProducers.spanEnd,
      inputs: { span: spanRef(id) }, result: { kind: "output" as const, name: "point" } });
  };
  const pointExpression = (source: string, author?: TimelineAuthorBinding): FragmentOperationRef => {
    const { base, direction, duration } = splitOffset(source);
    let ref: FragmentOperationRef;
    if (base === "start") ref = originRef();
    else if (base === "end") ref = operation("point:end");
    else if (/^\d+(?:\.\d+)?(?:f|ms|s)$/u.test(base)) {
      const extent = durationExtent(base);
      const owned = author === undefined ? undefined : { ...author, expression: { kind: "absolute" as const } };
      const spec = addInline(timelineAuthorTypes.offset,
        { direction: 1, ...(owned === undefined ? {} : { author: owned }) }, "offset", owned);
      ref = addOperation({ id: `point:absolute:${generated}`, producer: timelineAuthorProducers.offset,
        inputs: { point: originRef(), extent, spec }, result: { kind: "output" as const, name: "point" } });
    } else {
      const aggregate = /^(earliest|latest)\((.*)\)$/u.exec(base);
      if (aggregate !== null) {
        const terms = splitTopLevel(aggregate[2]!, ",").filter(Boolean);
        assert(terms.length > 0, `${aggregate[1]}() requires at least one Point.`);
        ref = pointExpression(terms[0]!);
        for (const term of terms.slice(1)) {
          ref = addOperation({ id: `point:${aggregate[1]}:${++generated}`,
            producer: aggregate[1] === "earliest" ? timelineAuthorProducers.earliest : timelineAuthorProducers.latest,
            inputs: { left: ref, right: pointExpression(term) }, result: { kind: "output" as const, name: "point" } });
        }
      } else {
        const boundary = /^([A-Za-z][A-Za-z0-9_.:#-]{0,191})\.(start|end)$/u.exec(base);
        if (boundary !== null) ref = boundaryRef(boundary[1]!, boundary[2] as "start" | "end");
        else {
          const declaration = declarations.get(base);
          assert(declaration?.kind === "instant", `Timeline expression ${base} is not an Instant.`);
          ref = instantRef(base);
        }
      }
    }
    if (direction === undefined) return ref;
    assert(duration !== undefined && duration.length > 0, `Timeline expression ${source} has no offset duration.`);
    const extent = durationExtent(duration);
    const owned = author === undefined ? undefined : { ...author, expression: { kind: "offset" as const, base } };
    const spec = addInline(timelineAuthorTypes.offset,
      { direction, ...(owned === undefined ? {} : { author: owned }) }, "offset", owned);
    return addOperation({ id: `point:offset:${++generated}`, producer: timelineAuthorProducers.offset,
      inputs: { point: ref, extent, spec }, result: { kind: "output" as const, name: "point" } });
  };

  for (const declaration of options.declarations) {
    if (declaration.kind === "instant") {
      addOperation({ id: `decl:${declaration.id}:point`, producer: timelineAuthorProducers.aliasPoint,
        inputs: { point: pointExpression(declaration.at, { binding: "at", declarationId: declaration.id }) }, result: { kind: "output" as const, name: "point" } });
      continue;
    }
    const hasFrom = declaration.from !== undefined;
    const hasUntil = declaration.until !== undefined;
    const hasFor = declaration.duration !== undefined || declaration.extentInput !== undefined;
    assert(Number(hasFrom) + Number(hasUntil) + Number(hasFor) === 2,
      `Timeline Window ${declaration.id} requires exactly two of from, until and for.`);
    if (hasFrom && hasUntil) {
      addOperation({ id: `decl:${declaration.id}:span`, producer: timelineAuthorProducers.spanBetween,
        inputs: {
          start: pointExpression(declaration.from!, { binding: "from", declarationId: declaration.id }),
          end: pointExpression(declaration.until!, { binding: "until", declarationId: declaration.id }),
        },
        result: { kind: "output" as const, name: "span" } });
    } else if (hasFrom) {
      addOperation({ id: `decl:${declaration.id}:span`, producer: timelineAuthorProducers.span,
        inputs: { start: pointExpression(declaration.from!, { binding: "from", declarationId: declaration.id }), extent: declarationExtent(declaration) },
        result: { kind: "output" as const, name: "span" } });
    } else {
      addOperation({ id: `decl:${declaration.id}:span`, producer: timelineAuthorProducers.spanEnding,
        inputs: { end: pointExpression(declaration.until!, { binding: "until", declarationId: declaration.id }), extent: declarationExtent(declaration) },
        result: { kind: "output" as const, name: "span" } });
    }
  }

  addOperation({ id: "point:end", producer: timelineAuthorProducers.aliasPoint,
    inputs: { point: pointExpression(options.end, { binding: "end" }) }, result: { kind: "output" as const, name: "point" } });
  addOperation({ id: "timeline", producer: timelineAuthorProducers.finalize,
    inputs: { header: input("header"), clock: input("clock"), end: operation("point:end") },
    result: { kind: "output" as const, name: "timeline" } });
  addOperation({ id: "span:window", producer: timelineAuthorProducers.spanBetween,
    inputs: { start: originRef(), end: operation("point:end") }, result: { kind: "output" as const, name: "span" } });

  const exports: { name: string; type: TypeRef; root: FragmentOperationRef }[] = [
    { name: "timeline", type: timelineTypes.timeline, root: operation("timeline") },
  ];
  const outputNames: { port: string; suffix: string }[] = [{ port: "timeline", suffix: "timeline" }];
  const exportInstant = (port: string, suffix: string, point: FragmentOperationRef, id: string, subjectId: string): void => {
    const operationId = `materialize:${port}`;
    addOperation({ id: operationId, producer: timelineAuthorProducers.instant,
      inputs: { timeline: operation("timeline"), point, spec: identitySpec(id, subjectId) },
      result: { kind: "output" as const, name: "instant" } });
    exports.push({ name: port, type: temporalTypes.instant, root: operation(operationId) });
    outputNames.push({ port, suffix });
  };
  const exportWindow = (port: string, suffix: string, span: FragmentOperationRef, id: string): void => {
    const operationId = `materialize:${port}`;
    addOperation({ id: operationId, producer: timelineAuthorProducers.window,
      inputs: { timeline: operation("timeline"), span, spec: identitySpec(id) },
      result: { kind: "output" as const, name: "window" } });
    exports.push({ name: port, type: temporalTypes.window, root: operation(operationId) });
    outputNames.push({ port, suffix });
  };

  exportWindow("window", "window", operation("span:window"), options.id);
  exportInstant("start", "start", originRef(), `${options.id}.start`, options.id);
  exportInstant("end", "end", operation("point:end"), `${options.id}.end`, options.id);
  for (const declaration of options.declarations) {
    const id = `${options.id}.${declaration.id}`;
    if (declaration.kind === "instant") {
      exportInstant(`anchor-${declaration.id}`, declaration.id, instantRef(declaration.id), id, id);
      continue;
    }
    exportWindow(`anchor-${declaration.id}`, declaration.id, spanRef(declaration.id), id);
    exportInstant(`anchor-${declaration.id}-start`, `${declaration.id}.start`, boundaryRef(declaration.id, "start"), `${id}.start`, id);
    exportInstant(`anchor-${declaration.id}-end`, `${declaration.id}.end`, boundaryRef(declaration.id, "end"), `${id}.end`, id);
  }

  return { fragment: sealGraphFragment({ inputs, operations, exports }), inlineInputs, extentInputs, outputNames };
}

export function createTimelineAuthorFragment(options: TimelineAuthorFragmentOptions): GraphFragment {
  return compileTimelineAuthorFragment(options).fragment;
}
