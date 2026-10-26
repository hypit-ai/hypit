import { temporalProducers } from "./index.js";
import { resolveTemporalExtent } from "./extent.js";
import type { TemporalExtent, TemporalBoundaryPolicy } from "./types.js";
import type {
  StudioTemporalAuthority,
  StudioTemporalRelationCompanion,
  StudioTemporalRelationValue,
} from "@hypit/studio-companion";

/** Preserve the declared base while writing an exact frame offset. */
export function formatTemporalPointEdit(reference: string, desired: number, base?: number): string {
  if (reference === "absolute") return `${desired}f`;
  if (base === undefined) throw new Error(`The ${reference} projection base is unavailable.`);
  const offset = desired - base;
  return `${reference}${offset >= 0 ? "+" : ""}${offset}f`;
}

type Instant = { readonly id: string; readonly timelineId: string; readonly frame: number };
type Timeline = { readonly id: string; readonly frameCount: number };
type AuthorSpec = {
  readonly projection?: { readonly ref?: string; readonly at?: unknown; readonly offset?: unknown };
  readonly direction?: 1 | -1;
  readonly resolution?: TemporalBoundaryPolicy;
  readonly author?: { readonly binding?: string; readonly relation?: "direct" | "after-start" | "before-end" };
};

function value<T>(input: StudioTemporalRelationValue | undefined, label: string): T {
  if (input === undefined) throw new Error(`Common Temporal relation requires ${label}.`);
  return input.value as T;
}

function duration(raw: unknown): string {
  const held = raw as { readonly unit?: string; readonly value?: number; readonly numerator?: number; readonly denominator?: number };
  if (held.unit === "frames") return `${held.value ?? 0}f`;
  if (held.unit === "milliseconds") return `${held.value ?? 0}ms`;
  if (held.unit === "seconds") return held.denominator === 1
    ? `${held.numerator ?? 0}s` : `${held.numerator ?? 0}/${held.denominator ?? 1}s`;
  return "?";
}

function signed(raw: unknown): string {
  const held = raw as { readonly unit?: string; readonly value?: number; readonly numerator?: number };
  const negative = held.unit === "seconds" ? (held.numerator ?? 0) < 0 : (held.value ?? 0) < 0;
  if (!negative) return `+${duration(raw)}`;
  return held.unit === "seconds"
    ? `-${duration({ ...held, numerator: Math.abs(held.numerator ?? 0) })}`
    : `-${duration({ ...held, value: Math.abs(held.value ?? 0) })}`;
}

function pointExpression(spec: AuthorSpec): string {
  const projection = spec.projection;
  if (projection?.ref === "absolute") return `${duration(projection.at)}${projection.offset === undefined ? "" : signed(projection.offset)}`;
  return typeof projection?.ref !== "string" ? "?"
    : `${projection.ref}${projection.offset === undefined ? "" : signed(projection.offset)}`;
}

function parameterAuthority(spec: AuthorSpec, record: string): Extract<StudioTemporalAuthority, { readonly kind: "parameter" }> | undefined {
  const author = spec.author;
  return typeof author?.binding === "string" && author.relation !== undefined
    ? { kind: "parameter", binding: author.binding, owner: `${record}:${author.binding}`, relation: author.relation }
    : undefined;
}

export const commonTemporalStudioRelations: readonly StudioTemporalRelationCompanion[] = [{
  id: "common-compose-window", match: { producer: temporalProducers.composeWindow, output: "window" },
  invert({ target }) {
    return target.kind !== "span" ? [] : [{ constraints: [
      { input: "start", target: { kind: "instant", frame: target.startFrame } },
      { input: "end", target: { kind: "instant", frame: target.endFrameExclusive } },
    ] }];
  },
  trace({ output, trace }) {
    const held = output.value as { readonly span?: { readonly startFrame?: number; readonly endFrameExclusive?: number } };
    const start = trace("start"); const end = trace("end");
    return start?.kind !== "instant" || end?.kind !== "instant"
      || !Number.isSafeInteger(held.span?.startFrame) || !Number.isSafeInteger(held.span?.endFrameExclusive)
      ? undefined : { kind: "window", start, end,
        startFrame: held.span!.startFrame!, endFrameExclusive: held.span!.endFrameExclusive! };
  },
}, {
  id: "common-reuse-instant", match: { producer: temporalProducers.reuseInstant, output: "instant" },
  invert({ target }) { return target.kind === "instant" ? [{ constraints: [{ input: "instant", target }] }] : []; },
  trace({ output, trace }) {
    const upstream = trace("instant"); const held = value<Instant>(output, "Instant");
    return upstream?.kind !== "instant" ? undefined : { ...upstream, frame: held.frame };
  },
}, {
  id: "common-project-program-instant", match: { producer: temporalProducers.projectProgramInstant, output: "instant" },
  invert({ target, inputs }) {
    if (target.kind !== "instant") return [];
    const spec = value<AuthorSpec>(inputs.spec, "Instant Spec");
    const binding = spec.author?.binding;
    if (typeof binding !== "string") return [];
    const timeline = value<Timeline>(inputs.timeline, "Timeline");
    const reference = spec.projection?.ref;
    const base = reference === "timeline.start" ? 0 : reference === "timeline.end" ? timeline.frameCount : undefined;
    return [{ writes: [{ input: "spec", binding,
      replacement: formatTemporalPointEdit(reference === "timeline.start" || reference === "timeline.end" ? reference : "absolute", target.frame, base) }] }];
  },
  trace({ output, inputs }) {
    const specInput = inputs.spec;
    const timeline = inputs.timeline;
    if (specInput === undefined || timeline === undefined) return undefined;
    const point = value<Instant>(output, "Instant");
    const spec = value<AuthorSpec>(specInput, "Instant Spec");
    const clock = value<Timeline>(timeline, "Timeline");
    const authority = parameterAuthority(spec, specInput.record);
    const reference = spec.projection?.ref;
    return { kind: "instant", expression: pointExpression(spec),
      reference: typeof reference === "string" ? reference : "absolute", frame: point.frame,
      source: { scope: "timeline", timelineId: point.timelineId, type: timeline.type, kind: "timeline", id: clock.id },
      authority: authority ?? { kind: "fixed" } };
  },
}, {
  id: "common-shift-instant", match: { producer: temporalProducers.shiftInstant, output: "instant" },
  invert({ target, inputs, desired }) {
    if (target.kind !== "instant") return [];
    const specInput = inputs.spec;
    const baseInput = inputs.instant;
    if (specInput === undefined || baseInput === undefined) return [];
    const spec = value<AuthorSpec>(specInput, "Shift Spec");
    const base = desired("instant");
    const baseFrame = base?.kind === "instant" ? base.frame : value<Instant>(baseInput, "base Instant").frame;
    const direction = spec.direction;
    if (direction !== 1 && direction !== -1) return [];
    const count = direction * (target.frame - baseFrame);
    if (!Number.isSafeInteger(count) || count < 0) return [];
    if (typeof spec.author?.binding === "string") return [{
      ...(base === undefined ? { constraints: [{ input: "instant", target: { kind: "instant" as const, frame: baseFrame } }] } : {}),
      writes: [{ input: "spec", binding: spec.author.binding, replacement: `${count}f` }],
    }];
    const timeline = value<{ readonly frameRate: { readonly numerator: number; readonly denominator: number } }>(
      inputs.timeline, "Timeline");
    const held = resolveTemporalExtent(value<TemporalExtent>(inputs.extent, "Extent"), timeline,
      spec.resolution ?? "cover");
    return [{ constraints: [{ input: "instant", target: { kind: "instant", frame: target.frame - direction * held } }] }];
  },
  trace({ output, inputs, trace }) {
    const held = value<Instant>(output, "Instant");
    const specInput = inputs.spec;
    if (specInput === undefined) return undefined;
    const spec = value<AuthorSpec>(specInput, "Shift Spec");
    const authority = parameterAuthority(spec, specInput.record);
    if (authority !== undefined) return { kind: "instant", expression: `${held.frame}f`, reference: "absolute",
      frame: held.frame, source: { scope: "timeline", timelineId: held.timelineId, type: output.type, kind: "resolved", id: held.id }, authority };
    const upstream = trace("instant");
    return upstream?.kind !== "instant" ? undefined : { ...upstream, frame: held.frame };
  },
}];
