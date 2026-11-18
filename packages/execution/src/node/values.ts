import type { JsonValue } from "../index.js";

export function object(value: unknown, label: string, fields?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${label} must be an object.`);
  }
  if (fields !== undefined && Object.keys(value).some(key => !fields.includes(key))) {
    throw new Error(`${label} has an unknown field.`);
  }
  return value as Record<string, unknown>;
}

export function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be nonempty text.`);
  return value;
}

export function identity(value: unknown, label: string): string {
  const id = text(value, label);
  if (!/^[a-z][a-z0-9.-]{0,191}$/u.test(id)) throw new Error(`${label} must be a stable lowercase identity.`);
  return id;
}

export function integer(value: unknown, label: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer of at least ${minimum}.`);
  }
  return value;
}

export function timestamp(value: unknown, label: string): string {
  const date = text(value, label);
  if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return date;
}

export function json(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return Array.from(value, item => json(item, label));
  return Object.fromEntries(Object.entries(object(value, label)).map(([key, field]) => [key, json(field, label)]));
}

export function errno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
