import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

import type { CaptionCuePayload } from "./types.js";
import type { CaptionWordAttribute } from "./types.js";

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

export function assertCaptionCuePayload(value: unknown, duration?: ExactTemporalValue): asserts value is CaptionCuePayload {
  record(value, "Caption Cue payload");
  identity(value.documentId, "Caption Cue payload document id");
  identity(value.cueId, "Caption Cue payload Cue id");
  if (value.role !== undefined) {
    assert(typeof value.role === "string" && value.role.trim().length > 0, "Caption Cue payload Role is invalid.");
  }
  assert(Array.isArray(value.words) && value.words.length > 0, "Caption Cue payload has no Words.");
  assert(Array.isArray(value.units) && value.units.length > 0, "Caption Cue payload has no Units.");
  if (duration !== undefined) assertExactTemporalValue(duration, "Caption Cue block duration");
  const words = new Map<string, Record<string, unknown>>();
  for (const [index, candidate] of value.words.entries()) {
    record(candidate, `Caption Cue Word ${index}`);
    identity(candidate.id, `Caption Cue Word ${index} id`);
    identity(candidate.unitId, `Caption Cue Word ${candidate.id} Unit`);
    assert(!words.has(candidate.id), `Caption Cue payload repeats Word ${candidate.id}.`);
    assert(typeof candidate.text === "string" && candidate.text.length > 0,
      `Caption Cue Word ${candidate.id} text is empty.`);
    assert(candidate.separatorBefore === "" || candidate.separatorBefore === " ",
      `Caption Cue Word ${candidate.id} separator is invalid.`);
    assert(Array.isArray(candidate.attributes), `Caption Cue Word ${candidate.id} attributes are invalid.`);
    for (const [attributeIndex, attribute] of candidate.attributes.entries()) {
      record(attribute, `Caption Cue Word ${candidate.id} attribute ${attributeIndex}`);
      assert(typeof attribute.name === "string" && /^[a-z][a-z0-9_-]{0,63}$/u.test(attribute.name),
        `Caption Cue Word ${candidate.id} attribute ${attributeIndex} name is invalid.`);
      assert(typeof attribute.value === "string" || typeof attribute.value === "boolean"
        || typeof attribute.value === "number" && Number.isFinite(attribute.value),
      `Caption Cue Word ${candidate.id} attribute ${attribute.name} value is invalid.`);
    }
    words.set(candidate.id, candidate);
  }
  const units = new Set<string>();
  const listedWords = new Set<string>();
  let previousStart = exactTemporalZero();
  for (const [index, candidate] of value.units.entries()) {
    record(candidate, `Caption Cue Unit ${index}`);
    identity(candidate.id, `Caption Cue Unit ${index} id`);
    assert(!units.has(candidate.id), `Caption Cue payload repeats Unit ${candidate.id}.`);
    assert(Array.isArray(candidate.wordIds) && candidate.wordIds.length > 0,
      `Caption Cue Unit ${candidate.id} has no Words.`);
    const ownWords = new Set<string>();
    for (const wordId of candidate.wordIds) {
      identity(wordId, `Caption Cue Unit ${candidate.id} Word`);
      assert(!ownWords.has(wordId), `Caption Cue Unit ${candidate.id} repeats Word ${wordId}.`);
      const word = words.get(wordId);
      assert(word !== undefined, `Caption Cue Unit ${candidate.id} references missing Word ${wordId}.`);
      assert(word.unitId === candidate.id,
        `Caption Cue Word ${wordId} belongs to ${String(word.unitId)}, not ${candidate.id}.`);
      ownWords.add(wordId);
      listedWords.add(wordId);
    }
    assertExactTemporalValue(candidate.start as ExactTemporalValue, `Caption Cue Unit ${candidate.id} start`);
    assertExactTemporalValue(candidate.end as ExactTemporalValue, `Caption Cue Unit ${candidate.id} end`);
    assert(compareExactTemporalValues(candidate.start as ExactTemporalValue, exactTemporalZero()) >= 0,
      `Caption Cue Unit ${candidate.id} starts before its block.`);
    assert(compareExactTemporalValues(candidate.end as ExactTemporalValue, candidate.start as ExactTemporalValue) > 0,
      `Caption Cue Unit ${candidate.id} is empty or reversed.`);
    assert(compareExactTemporalValues(candidate.start as ExactTemporalValue, previousStart) >= 0,
      `Caption Cue Unit ${candidate.id} is out of display order.`);
    if (duration !== undefined) {
      assert(compareExactTemporalValues(candidate.end as ExactTemporalValue, duration) <= 0,
        `Caption Cue Unit ${candidate.id} ends after its block.`);
    }
    previousStart = candidate.start as ExactTemporalValue;
    units.add(candidate.id);
  }
  for (const word of words.values()) {
    assert(units.has(word.unitId as string),
      `Caption Cue Word ${String(word.id)} references missing Unit ${String(word.unitId)}.`);
    assert(listedWords.has(word.id as string),
      `Caption Cue Word ${String(word.id)} is not listed by Unit ${String(word.unitId)}.`);
  }
}

export function sealCaptionCuePayload(value: CaptionCuePayload, duration?: ExactTemporalValue): CaptionCuePayload {
  assertCaptionCuePayload(value, duration);
  return structuredClone(value);
}

export function replaceCaptionWord(
  payload: CaptionCuePayload,
  wordId: string,
  text: string,
): CaptionCuePayload {
  assertCaptionCuePayload(payload);
  assert(text.length > 0, "Caption replacement Word text is empty.");
  let found = false;
  const result: CaptionCuePayload = {
    ...structuredClone(payload),
    words: payload.words.map((word) => {
      if (word.id !== wordId) return structuredClone(word);
      found = true;
      return { ...structuredClone(word), text };
    }),
  };
  assert(found, `Unknown Caption Word: ${wordId}`);
  return sealCaptionCuePayload(result);
}

export function setCaptionWordAttribute(
  payload: CaptionCuePayload,
  wordId: string,
  attribute: CaptionWordAttribute,
): CaptionCuePayload {
  assertCaptionCuePayload(payload);
  let found = false;
  const result: CaptionCuePayload = {
    ...structuredClone(payload),
    words: payload.words.map((word) => {
      if (word.id !== wordId) return structuredClone(word);
      found = true;
      return {
        ...structuredClone(word),
        attributes: [...word.attributes.filter((candidate) => candidate.name !== attribute.name),
          structuredClone(attribute)],
      };
    }),
  };
  assert(found, `Unknown Caption Word: ${wordId}`);
  return sealCaptionCuePayload(result);
}

export function removeCaptionWordAttribute(
  payload: CaptionCuePayload,
  wordId: string,
  name: string,
): CaptionCuePayload {
  assertCaptionCuePayload(payload);
  let found = false;
  const result: CaptionCuePayload = {
    ...structuredClone(payload),
    words: payload.words.map((word) => {
      if (word.id !== wordId) return structuredClone(word);
      found = true;
      return { ...structuredClone(word), attributes: word.attributes.filter((attribute) => attribute.name !== name) };
    }),
  };
  assert(found, `Unknown Caption Word: ${wordId}`);
  return sealCaptionCuePayload(result);
}

export function retimeCaptionUnit(
  payload: CaptionCuePayload,
  unitId: string,
  start: ExactTemporalValue,
  end: ExactTemporalValue,
  duration?: ExactTemporalValue,
): CaptionCuePayload {
  assertCaptionCuePayload(payload, duration);
  let found = false;
  const result: CaptionCuePayload = {
    ...structuredClone(payload),
    units: payload.units.map((unit) => {
      if (unit.id !== unitId) return structuredClone(unit);
      found = true;
      return { ...structuredClone(unit), start: structuredClone(start), end: structuredClone(end) };
    }),
  };
  assert(found, `Unknown Caption Unit: ${unitId}`);
  return sealCaptionCuePayload(result, duration);
}
