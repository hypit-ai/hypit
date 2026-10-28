import type {
  TemporalRate,
  TemporalRelation,
  TemporalRelativePoint,
  TemporalRelativeRange,
} from "./types.js";
import { parseTemporalDuration } from "./literal.js";

export const temporalRelationFieldNames = [
  "target-from", "target-until", "target-at", "source-at", "rate",
  "source-from", "source-until", "wrap-from", "wrap-until",
] as const;

export type TemporalRelationFieldName = typeof temporalRelationFieldNames[number];
export type TemporalRelationLiteralFields = Readonly<Partial<Record<TemporalRelationFieldName, string>>>;

export const temporalCubicRelationFieldNames = [
  "target-from", "target-until", "source-at-start", "source-control-1", "source-control-2", "source-at-end",
] as const;
export type TemporalCubicRelationFieldName = typeof temporalCubicRelationFieldNames[number];
export type TemporalCubicRelationLiteralFields = Readonly<Partial<Record<TemporalCubicRelationFieldName, string>>>;

function divisor(left: number, right: number): number {
  let a = Math.abs(left), b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function parseTemporalRate(raw: string, label: string): TemporalRate {
  const fraction = /^(-?\d+)\/([1-9]\d*)$/u.exec(raw);
  if (fraction !== null) {
    const numerator = Number(fraction[1]), denominator = Number(fraction[2]);
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
      throw new Error(`${label} is outside safe arithmetic.`);
    }
    const common = divisor(numerator, denominator);
    return { numerator: numerator / common, denominator: denominator / common };
  }
  const decimal = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(raw);
  if (decimal === null) throw new Error(`${label} must be an exact integer, decimal or fraction.`);
  const fractional = decimal[3] ?? "", denominator = 10 ** fractional.length;
  const magnitude = Number(decimal[2]) * denominator + (fractional.length === 0 ? 0 : Number(fractional));
  const numerator = decimal[1] === "-" ? -magnitude : magnitude;
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new Error(`${label} is outside safe arithmetic.`);
  }
  const common = divisor(numerator, denominator);
  return { numerator: numerator / common, denominator: denominator / common };
}

export function parseTemporalRelativePoint(
  raw: string | undefined,
  fallback: "start" | "end",
  label: string,
): TemporalRelativePoint {
  const value = raw ?? fallback;
  const zero = parseTemporalDuration("0s", label);
  if (value === "start" || value === "end") return { edge: value, offset: zero };
  const fromStart = /^(?:start\+)?(.+)$/u.exec(value);
  if (fromStart !== null && !value.startsWith("end-")) {
    return { edge: "start", offset: parseTemporalDuration(fromStart[1]!, label) };
  }
  const fromEnd = /^end-(.+)$/u.exec(value);
  if (fromEnd !== null) return { edge: "end", offset: parseTemporalDuration(fromEnd[1]!, label) };
  throw new Error(`${label} must be start, end, a duration from start, start+duration or end-duration.`);
}

function relativeRange(
  fields: TemporalRelationLiteralFields,
  prefix: "target" | "source" | "wrap",
  label: string,
  required = false,
): TemporalRelativeRange | undefined {
  const from = fields[`${prefix}-from`], until = fields[`${prefix}-until`];
  if (!required && from === undefined && until === undefined) return undefined;
  return {
    from: parseTemporalRelativePoint(from, "start", `${label}.${prefix}-from`),
    until: parseTemporalRelativePoint(until, "end", `${label}.${prefix}-until`),
  };
}

/** Parse one syntax-neutral exact relation from package-authored literal fields. */
export function parseTemporalRelationFields(
  fields: TemporalRelationLiteralFields,
  label: string,
): TemporalRelation {
  const target = relativeRange(fields, "target", label, true)!;
  const source = relativeRange(fields, "source", label, true)!;
  const hasRate = fields.rate !== undefined || fields["target-at"] !== undefined
    || fields["source-at"] !== undefined || fields["wrap-from"] !== undefined
    || fields["wrap-until"] !== undefined;
  if (!hasRate) return { kind: "fit", target, source };
  const wrap = relativeRange(fields, "wrap", label);
  return {
    kind: "rate",
    target,
    targetAt: parseTemporalRelativePoint(fields["target-at"], "start", `${label}.target-at`),
    sourceAt: parseTemporalRelativePoint(fields["source-at"], "start", `${label}.source-at`),
    rate: parseTemporalRate(fields.rate ?? "1", `${label}.rate`),
    source,
    ...(wrap === undefined ? {} : { wrap }),
  };
}

/** Parse one exact cubic source-position relation from package-authored literal fields. */
export function parseTemporalCubicRelationFields(
  fields: TemporalCubicRelationLiteralFields,
  label: string,
): TemporalRelation {
  const target = relativeRange(fields, "target", label, true)!;
  const required = (name: "source-at-start" | "source-control-1" | "source-control-2" | "source-at-end") => {
    const value = fields[name];
    if (value === undefined) throw new Error(`${label}.${name} is required.`);
    return value;
  };
  return {
    kind: "cubic",
    target,
    sourceAtStart: parseTemporalRelativePoint(required("source-at-start"), "start", `${label}.source-at-start`),
    sourceControl1: parseTemporalRelativePoint(required("source-control-1"), "start", `${label}.source-control-1`),
    sourceControl2: parseTemporalRelativePoint(required("source-control-2"), "end", `${label}.source-control-2`),
    sourceAtEnd: parseTemporalRelativePoint(required("source-at-end"), "end", `${label}.source-at-end`),
  };
}
