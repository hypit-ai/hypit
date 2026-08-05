import { digestOf } from "@svml/protocol";
import type { Digest } from "@svml/protocol";

import type {
  CaptionPresentationMode,
  CaptionPresentationPlan,
  CaptionPresentationUnit,
  TimedCaptionRegion,
} from "./types.js";

const DISPLAY_WORD = /[\p{L}\p{M}\p{N}]+(?:['’.-][\p{L}\p{M}\p{N}]+)*/gu;

type DisplayPart = {
  readonly display: string;
  readonly start: number;
  readonly end: number;
};

function displayWords(value: string): DisplayPart[] {
  const words: DisplayPart[] = [];
  DISPLAY_WORD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DISPLAY_WORD.exec(value))) {
    words.push({ display: match[0], start: match.index, end: match.index + match[0].length });
  }
  return words;
}

function wholeRegion(region: TimedCaptionRegion): CaptionPresentationUnit[] {
  if (!region.display) return [];
  return [{
    id: `${region.id}:whole`,
    regionId: region.id,
    display: region.display,
    displayStart: 0,
    displayEnd: region.display.length,
    startSec: region.startSec,
    endSec: region.endSec,
    basis: "region-envelope",
    timingQuality: region.startQuality === "estimated" || region.endQuality === "estimated" ? "estimated" : "derived",
  }];
}

function proportionalWords(region: TimedCaptionRegion): CaptionPresentationUnit[] {
  const words = displayWords(region.display);
  if (!words.length) return [];
  const exact = new Map(region.refinements.map((item) => [`${item.displayStart}:${item.displayEnd}`, item]));
  const units: Array<CaptionPresentationUnit | undefined> = words.map((word, index) => {
    const refinement = exact.get(`${word.start}:${word.end}`);
    return refinement ? {
      id: `${region.id}:word:${index + 1}`,
      regionId: region.id,
      display: word.display,
      displayStart: word.start,
      displayEnd: word.end,
      startSec: refinement.startSec,
      endSec: refinement.endSec,
      basis: "exact-correspondence",
      timingQuality: refinement.startQuality === "estimated" || refinement.endQuality === "estimated" ? "estimated" : "derived",
    } : undefined;
  });

  let cursor = 0;
  while (cursor < words.length) {
    if (units[cursor]) {
      cursor += 1;
      continue;
    }
    const runStart = cursor;
    while (cursor < words.length && !units[cursor]) cursor += 1;
    const runEnd = cursor;
    const left = runStart === 0 ? region.startSec : units[runStart - 1]!.endSec;
    const right = runEnd === words.length ? region.endSec : Math.max(left, units[runEnd]!.startSec);
    const weights = words.slice(runStart, runEnd).map((word) => Math.max(1, [...word.display].length));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let used = 0;
    for (let index = runStart; index < runEnd; index += 1) {
      const weight = weights[index - runStart]!;
      const startSec = left + (right - left) * used / total;
      used += weight;
      const endSec = left + (right - left) * used / total;
      const word = words[index]!;
      units[index] = {
        id: `${region.id}:word:${index + 1}`,
        regionId: region.id,
        display: word.display,
        displayStart: word.start,
        displayEnd: word.end,
        startSec,
        endSec,
        basis: "presentation-estimate",
        timingQuality: "estimated",
      };
    }
  }
  return units as CaptionPresentationUnit[];
}

function characterFlow(region: TimedCaptionRegion): CaptionPresentationUnit[] {
  const characters = [...region.display];
  if (!characters.length) return [];
  const duration = region.endSec - region.startSec;
  const units: CaptionPresentationUnit[] = [];
  let sourceOffset = 0;
  for (const [index, character] of characters.entries()) {
    const start = sourceOffset;
    sourceOffset += character.length;
    if (!character.trim()) continue;
    units.push({
      id: `${region.id}:character:${index + 1}`,
      regionId: region.id,
      display: character,
      displayStart: start,
      displayEnd: sourceOffset,
      startSec: region.startSec + duration * index / characters.length,
      endSec: region.startSec + duration * (index + 1) / characters.length,
      basis: "presentation-estimate",
      timingQuality: "estimated",
    });
  }
  return units;
}

export function planCaptionPresentation(
  projection: { readonly projectionDigest: Digest; readonly regions: readonly TimedCaptionRegion[] },
  mode: CaptionPresentationMode = "whole",
): CaptionPresentationPlan {
  const units = projection.regions.flatMap((region) =>
    mode === "whole"
      ? wholeRegion(region)
      : mode === "proportional-word"
        ? proportionalWords(region)
        : characterFlow(region));
  const payload = {
    contract: "svml.caption-presentation-plan@0" as const,
    sourceProjectionDigest: projection.projectionDigest,
    mode,
    units,
  };
  return { ...payload, planDigest: digestOf(payload) };
}
