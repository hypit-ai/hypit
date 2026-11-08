import { canonicalize } from "@hypit/hypit/protocol";
import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

import type { CaptionNlePayload } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value),
    `${label} is invalid.`);
}

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
}

/** Validate the complete, direct Caption facts owned by one NLE Component Item. */
export function assertCaptionNlePayload(value: unknown, duration?: ExactTemporalValue): asserts value is CaptionNlePayload {
  record(value, "Caption NLE payload");
  identity(value.documentId, "Caption NLE payload document id");
  identity(value.cueId, "Caption NLE payload Cue id");
  if (value.role !== undefined) {
    assert(typeof value.role === "string" && value.role.trim().length > 0, "Caption NLE payload Role is invalid.");
  }
  assert(Array.isArray(value.words) && value.words.length > 0, "Caption NLE payload has no Words.");
  assert(Array.isArray(value.units) && value.units.length > 0, "Caption NLE payload has no Units.");
  if (duration !== undefined) assertExactTemporalValue(duration, "Caption NLE Item duration");

  const words = new Map<string, Record<string, unknown>>();
  for (const [index, candidate] of value.words.entries()) {
    record(candidate, `Caption NLE Word ${index}`);
    identity(candidate.id, `Caption NLE Word ${index} id`);
    identity(candidate.unitId, `Caption NLE Word ${candidate.id} Unit`);
    assert(!words.has(candidate.id), `Caption NLE payload repeats Word ${candidate.id}.`);
    assert(typeof candidate.text === "string" && candidate.text.length > 0,
      `Caption NLE Word ${candidate.id} text is empty.`);
    assert(candidate.separatorBefore === "" || candidate.separatorBefore === " ",
      `Caption NLE Word ${candidate.id} separator is invalid.`);
    assert(Array.isArray(candidate.attributes), `Caption NLE Word ${candidate.id} attributes are invalid.`);
    canonicalize(candidate.attributes);
    words.set(candidate.id, candidate);
  }

  const units = new Set<string>();
  const listedWords = new Set<string>();
  let previousStart = exactTemporalZero();
  for (const [index, candidate] of value.units.entries()) {
    record(candidate, `Caption NLE Unit ${index}`);
    identity(candidate.id, `Caption NLE Unit ${index} id`);
    assert(!units.has(candidate.id), `Caption NLE payload repeats Unit ${candidate.id}.`);
    assert(Array.isArray(candidate.wordIds) && candidate.wordIds.length > 0,
      `Caption NLE Unit ${candidate.id} has no Words.`);
    const ownWords = new Set<string>();
    for (const wordId of candidate.wordIds) {
      identity(wordId, `Caption NLE Unit ${candidate.id} Word`);
      assert(!ownWords.has(wordId), `Caption NLE Unit ${candidate.id} repeats Word ${wordId}.`);
      const word = words.get(wordId);
      assert(word !== undefined, `Caption NLE Unit ${candidate.id} references missing Word ${wordId}.`);
      assert(word.unitId === candidate.id,
        `Caption NLE Word ${wordId} belongs to ${String(word.unitId)}, not ${candidate.id}.`);
      ownWords.add(wordId);
      listedWords.add(wordId);
    }
    assertExactTemporalValue(candidate.start as ExactTemporalValue, `Caption NLE Unit ${candidate.id} start`);
    assertExactTemporalValue(candidate.end as ExactTemporalValue, `Caption NLE Unit ${candidate.id} end`);
    assert(compareExactTemporalValues(candidate.start as ExactTemporalValue, exactTemporalZero()) >= 0,
      `Caption NLE Unit ${candidate.id} starts before its Item.`);
    assert(compareExactTemporalValues(candidate.end as ExactTemporalValue, candidate.start as ExactTemporalValue) > 0,
      `Caption NLE Unit ${candidate.id} is empty or reversed.`);
    assert(compareExactTemporalValues(candidate.start as ExactTemporalValue, previousStart) >= 0,
      `Caption NLE Unit ${candidate.id} is out of display order.`);
    if (duration !== undefined) {
      assert(compareExactTemporalValues(candidate.end as ExactTemporalValue, duration) <= 0,
        `Caption NLE Unit ${candidate.id} ends after its Item.`);
    }
    previousStart = candidate.start as ExactTemporalValue;
    units.add(candidate.id);
  }
  for (const word of words.values()) {
    assert(units.has(word.unitId as string), `Caption NLE Word ${String(word.id)} references missing Unit ${String(word.unitId)}.`);
    assert(listedWords.has(word.id as string),
      `Caption NLE Word ${String(word.id)} is not listed by Unit ${String(word.unitId)}.`);
  }
}

export function sealCaptionNlePayload(value: CaptionNlePayload, duration?: ExactTemporalValue): CaptionNlePayload {
  assertCaptionNlePayload(value, duration);
  return structuredClone(value);
}

/** Change display spelling without changing the Unit's established speech time. */
export function replaceCaptionNleWord(
  payload: CaptionNlePayload,
  wordId: string,
  text: string,
): CaptionNlePayload {
  assertCaptionNlePayload(payload);
  assert(text.length > 0, "Caption replacement Word text is empty.");
  let found = false;
  const result: CaptionNlePayload = {
    ...structuredClone(payload),
    words: payload.words.map((word) => {
      if (word.id !== wordId) return structuredClone(word);
      found = true;
      return { ...structuredClone(word), text };
    }),
  };
  assert(found, `Unknown Caption NLE Word: ${wordId}`);
  return sealCaptionNlePayload(result);
}

/** Move one Unit's exact local boundaries; callers decide any neighbouring edit policy. */
export function retimeCaptionNleUnit(
  payload: CaptionNlePayload,
  unitId: string,
  start: ExactTemporalValue,
  end: ExactTemporalValue,
  duration?: ExactTemporalValue,
): CaptionNlePayload {
  assertCaptionNlePayload(payload, duration);
  let found = false;
  const result: CaptionNlePayload = {
    ...structuredClone(payload),
    units: payload.units.map((unit) => {
      if (unit.id !== unitId) return structuredClone(unit);
      found = true;
      return { ...structuredClone(unit), start: structuredClone(start), end: structuredClone(end) };
    }),
  };
  assert(found, `Unknown Caption NLE Unit: ${unitId}`);
  return sealCaptionNlePayload(result, duration);
}
