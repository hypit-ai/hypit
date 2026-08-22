import type {
  StudioPlacement as Placement,
  StudioTemporalLineage,
  StudioTemporalProjection,
  StudioTemporalSource,
} from "@hypit/studio-adapter";

type Point = {
  readonly ref: "program.start" | "program.end" | "selection.start" | "selection.end" | "segment.start" | "segment.end" | "moment.cue" | "absolute";
  readonly offset?: unknown;
  readonly at?: unknown;
};

type Projection = { readonly start: Point; readonly end: Point };
type Spec = { readonly id?: string; readonly projection?: Projection };

function valueOf(child: Placement["children"][number]): Spec | undefined {
  const found = child.values.find((value) => value.type.name === "MediaItemSpec"
    || value.type.name === "TextItemSpec" || value.type.name === "PlainTextItemSpec");
  return found?.value as Spec | undefined;
}

function authoredId(runtimeId: string, children: readonly Placement["children"][number][]): string | undefined {
  return children
    .filter((child): child is Placement["children"][number] & { readonly id: string } => child.id !== undefined)
    .map((child) => child.id)
    .sort((left, right) => right.length - left.length)
    .find((id) => runtimeId === id || runtimeId.startsWith(`${id}::`));
}

function expression(point: Point): string {
  if (point.ref === "absolute") return duration(point.at);
  return point.offset === undefined ? point.ref : `${point.ref}${signed(point.offset)}`;
}

function duration(value: unknown): string {
  const item = value as { readonly unit?: string; readonly value?: number; readonly numerator?: number; readonly denominator?: number } | undefined;
  if (item?.unit === "frames") return `${item.value ?? 0}f`;
  if (item?.unit === "milliseconds") return `${item.value ?? 0}ms`;
  if (item?.unit === "seconds") return item.denominator === 1
    ? `${item.numerator ?? 0}s`
    : `${item.numerator ?? 0}/${item.denominator ?? 1}s`;
  return "?";
}

function signed(value: unknown): string {
  const item = value as { readonly unit?: string; readonly value?: number; readonly numerator?: number } | undefined;
  if (item === undefined) return "+?";
  const negative = item?.unit === "seconds" ? (item.numerator ?? 0) < 0 : (item?.value ?? 0) < 0;
  if (!negative) return `+${duration(value)}`;
  if (item?.unit === "seconds") return `-${duration({ ...item, numerator: Math.abs(item.numerator ?? 0) })}`;
  return `-${duration({ ...item, value: Math.abs(item.value ?? 0) })}`;
}

function markerId(child: Placement["children"][number]): string | undefined {
  const path = child.referenceAttributes.during
    ?? child.referenceAttributes.selection
    ?? child.referenceAttributes.segment
    ?? child.referenceAttributes.at
    ?? child.referenceAttributes.moment;
  return path?.slice(path.lastIndexOf(".") + 1);
}

function sourceOf(
  child: Placement["children"][number],
  projection: Projection,
): StudioTemporalSource {
  const marker = markerId(child);
  const refs = [projection.start.ref, projection.end.ref];
  const sourceType = child.referenceTypes.during ?? child.referenceTypes.selection
    ?? child.referenceTypes.segment ?? child.referenceTypes.at ?? child.referenceTypes.moment;
  const kind = sourceType === "NarrativeSelection" || refs.some((ref) => ref.startsWith("selection."))
    ? "selection"
    : sourceType === "NarrativeExcerpt" || refs.some((ref) => ref.startsWith("segment."))
      ? "segment"
      : sourceType === "NarrativeMoment" || refs.some((ref) => ref === "moment.cue")
        ? "moment"
        : "program";
  return {
    kind,
    ...(marker === undefined ? {} : { id: marker }),
  };
}

/**
 * Join one resolved Program item back to the exact child-authored projection.
 * The Program supplies the frame truth; the observed inline Spec supplies the
 * endpoint expressions. Nothing here evaluates or reimplements Temporal.
 */
export function itemTemporalLineage(input: {
  readonly runtimeId: string;
  readonly span: { readonly startFrame: number; readonly endFrameExclusive: number };
  readonly placement?: Placement;
}): StudioTemporalLineage | undefined {
  const children = input.placement?.children ?? [];
  const id = authoredId(input.runtimeId, children);
  const child = id === undefined ? undefined : children.find((candidate) => candidate.id === id);
  const spec = child === undefined ? undefined : valueOf(child);
  const projection = spec?.projection;
  if (child === undefined || projection === undefined) return undefined;
  const source = sourceOf(child, projection);
  const projected: StudioTemporalProjection = {
    startExpression: expression(projection.start),
    endExpression: expression(projection.end),
    startFrame: input.span.startFrame,
    endFrameExclusive: input.span.endFrameExclusive,
  };
  return { source, projection: projected, phases: [] };
}
