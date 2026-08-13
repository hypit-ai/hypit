import type { TypedRecord } from "./build.js";
import { SvmlError } from "./error.js";
import type { Digest, TypeRef } from "./identity.js";
import type { CanonicalValue, StoredValue } from "./value.js";

function normalize(value: unknown, path: string, ancestors: WeakSet<object>): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SvmlError("NON_CANONICAL_NUMBER", `${path} must be finite`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new SvmlError("CYCLIC_VALUE", `${path} contains a cycle`);
    ancestors.add(value);
    const result = value.map((item, index) => normalize(item, `${path}[${index}]`, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new SvmlError("NON_CANONICAL_OBJECT", `${path} must be a plain object`);
    }
    if (ancestors.has(value)) throw new SvmlError("CYCLIC_VALUE", `${path} contains a cycle`);
    ancestors.add(value);
    const result: Record<string, CanonicalValue> = {};
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
        throw new SvmlError("NON_CANONICAL_ACCESSOR", `${path}.${key} must be a data property`);
      }
      if (descriptor.value === undefined) {
        throw new SvmlError("NON_CANONICAL_UNDEFINED", `${path}.${key} is undefined`);
      }
      Object.defineProperty(result, key, {
        value: normalize(descriptor.value, `${path}.${key}`, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    ancestors.delete(value);
    return result;
  }
  throw new SvmlError("NON_CANONICAL_VALUE", `${path} contains ${typeof value}`);
}

export function canonicalize(value: unknown): CanonicalValue {
  return normalize(value, "$input", new WeakSet<object>());
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

const sha256RoundConstants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** Synchronous, Host-independent SHA-256 for deterministic Core identities. */
function sha256(value: string): string {
  const source = new TextEncoder().encode(value);
  const byteLength = Math.ceil((source.length + 9) / 64) * 64;
  const bytes = new Uint8Array(byteLength);
  bytes.set(source);
  bytes[source.length] = 0x80;
  const bitLength = BigInt(source.length) * 8n;
  const view = new DataView(bytes.buffer);
  view.setUint32(byteLength - 8, Number((bitLength >> 32n) & 0xffffffffn), false);
  view.setUint32(byteLength - 4, Number(bitLength & 0xffffffffn), false);

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < byteLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15]!;
      const right = words[index - 2]!;
      const s0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const s1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
    }
    let a = state[0]!;
    let b = state[1]!;
    let c = state[2]!;
    let d = state[3]!;
    let e = state[4]!;
    let f = state[5]!;
    let g = state[6]!;
    let h = state[7]!;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const first = (h + sum1 + choose + sha256RoundConstants[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }
    state[0] = (state[0]! + a) >>> 0;
    state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0;
    state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0;
    state[5] = (state[5]! + f) >>> 0;
    state[6] = (state[6]! + g) >>> 0;
    state[7] = (state[7]! + h) >>> 0;
  }
  return [...state].map((item) => item.toString(16).padStart(8, "0")).join("");
}

export function digestOf(value: unknown): Digest {
  return `sha256:${sha256(canonicalStringify(value))}`;
}

export function isDigest(value: string): value is Digest {
  return /^sha256:[0-9a-f]{64}$/u.test(value);
}

export function recordDigest(type: TypeRef, value: StoredValue): Digest {
  return digestOf({ type, value });
}

export function semanticRecordsDigest(records: readonly TypedRecord[]): Digest {
  return digestOf(
    [...records]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((record) => ({
        id: record.id,
        type: record.type,
        value: record.value,
      })),
  );
}
