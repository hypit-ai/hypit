import type { StructuredElement } from "@hypit/hypit/markup";
import { assertTemporalRelationSpec } from "@hypit/temporal";
import type {
  TemporalRate,
  TemporalRelation,
  TemporalRelationSpec,
  TemporalRelativePoint,
  TemporalRelativeRange,
} from "@hypit/temporal";

import { parseTemporalDuration } from "./duration.js";

export const temporalRelationAttributeNames = [
  "target-from", "target-until", "target-at", "source-at", "rate",
  "source-from", "source-until", "wrap-from", "wrap-until",
] as const;

function optionalText(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}

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
  element: StructuredElement,
  prefix: "target" | "source" | "wrap",
  required = false,
): TemporalRelativeRange | undefined {
  const from = optionalText(element, `${prefix}-from`), until = optionalText(element, `${prefix}-until`);
  if (!required && from === undefined && until === undefined) return undefined;
  return {
    from: parseTemporalRelativePoint(from, "start", `${element.name}.${prefix}-from`),
    until: parseTemporalRelativePoint(until, "end", `${element.name}.${prefix}-until`),
  };
}

/** Parse one namespaced or unqualified Clip-local Map element. */
export function parseTemporalRelationElement(element: StructuredElement): TemporalRelation {
  const allowed = new Set(temporalRelationAttributeNames);
  const unexpected = Object.keys(element.attributes).filter((name) => !allowed.has(name as typeof temporalRelationAttributeNames[number]));
  if (unexpected.length > 0) throw new Error(`${element.name} has unsupported attributes ${unexpected.join(", ")}.`);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) {
    throw new Error(`${element.name} must be empty.`);
  }
  const target = relativeRange(element, "target", true)!;
  const source = relativeRange(element, "source", true)!;
  const hasRate = element.attributes.rate !== undefined || element.attributes["target-at"] !== undefined
    || element.attributes["source-at"] !== undefined || element.attributes["wrap-from"] !== undefined
    || element.attributes["wrap-until"] !== undefined;
  if (!hasRate) return { kind: "fit", target, source };
  const wrap = relativeRange(element, "wrap");
  return {
    kind: "rate",
    target,
    targetAt: parseTemporalRelativePoint(optionalText(element, "target-at"), "start", `${element.name}.target-at`),
    sourceAt: parseTemporalRelativePoint(optionalText(element, "source-at"), "start", `${element.name}.source-at`),
    rate: parseTemporalRate(optionalText(element, "rate") ?? "1", `${element.name}.rate`),
    source,
    ...(wrap === undefined ? {} : { wrap }),
  };
}

export function parseInlineTemporalRelation(element: StructuredElement): TemporalRelationSpec | undefined {
  const relations = element.children.flatMap((child) => child.kind === "element"
    && (child.name.endsWith(":Map") || child.name === "Map") ? [parseTemporalRelationElement(child)] : []);
  if (relations.length === 0) return undefined;
  const result = { relations };
  assertTemporalRelationSpec(result);
  return result;
}
