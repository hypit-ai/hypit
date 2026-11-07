import { assertCaptionDocument, assertLocalCaptionTiming } from "@hypit/caption";
import type { CaptionDocument, LocalCaptionTiming } from "@hypit/caption";
import type { NarrativeLocalTiming } from "@hypit/narrative-temporal";
import { compareExactTemporalValues } from "@hypit/temporal";

import type { NarrativeCaptionBinding } from "./types.js";
import { NarrativeCaptionTimingError } from "./error.js";
import { assertNarrativeCaptionBindingIdentity } from "./identity.js";

export function projectNarrativeCaptionTiming(
  document: CaptionDocument,
  binding: NarrativeCaptionBinding,
  timing: NarrativeLocalTiming,
): LocalCaptionTiming {
  assertCaptionDocument(document);
  assertNarrativeCaptionBindingIdentity(binding);
  if (binding.documentId !== document.id || binding.narrativeId !== timing.narrativeId) {
    throw new NarrativeCaptionTimingError("CAPTION_BINDING", "Caption binding disagrees with its document or NarrativeLocalTiming.");
  }
  const bindings = new Map(binding.units.map((unit) => [unit.unitId, unit.sourceTokenIds] as const));
  const documentIds = new Set(document.units.map((unit) => unit.id));
  const missingBinding = document.units.find((unit) => !bindings.has(unit.id));
  const unknownBinding = binding.units.find((unit) => !documentIds.has(unit.unitId));
  if (missingBinding !== undefined || unknownBinding !== undefined || bindings.size !== documentIds.size) {
    const path = missingBinding === undefined ? unknownBinding!.unitId : missingBinding.id;
    throw new NarrativeCaptionTimingError("CAPTION_BINDING",
      `CaptionDocument ${document.id} -> Binding ${binding.id} does not connect Unit ${path} exactly.`);
  }
  const tokens = new Map(timing.tokens.map((token) => [token.tokenId, token] as const));
  const boundaries = new Map(timing.boundaries.map((boundary) => [boundary.id, boundary.at] as const));
  const timed: LocalCaptionTiming["units"][number][] = [];
  for (const unit of document.units) {
    const sourceTokenIds = bindings.get(unit.id)!;
    const sourceTokens = sourceTokenIds.map((tokenId) => {
      const token = tokens.get(tokenId);
      if (token === undefined) {
        throw new NarrativeCaptionTimingError("CAPTION_PROJECTION",
          `CaptionDocument ${document.id} -> Unit ${unit.id} -> Binding ${binding.id} -> Token ${tokenId} is absent from NarrativeLocalTiming ${timing.id}.`);
      }
      return token;
    });
    const first = sourceTokens[0]!;
    const last = sourceTokens.at(-1)!;
    const start = boundaries.get(first.startBoundaryId);
    if (start === undefined) {
      throw new NarrativeCaptionTimingError("CAPTION_PROJECTION",
        `CaptionDocument ${document.id} -> Unit ${unit.id} -> Token ${first.tokenId} -> Boundary ${first.startBoundaryId} is absent from NarrativeLocalTiming ${timing.id}.`);
    }
    const end = boundaries.get(last.endBoundaryId);
    if (end === undefined) {
      throw new NarrativeCaptionTimingError("CAPTION_PROJECTION",
        `CaptionDocument ${document.id} -> Unit ${unit.id} -> Token ${last.tokenId} -> Boundary ${last.endBoundaryId} is absent from NarrativeLocalTiming ${timing.id}.`);
    }
    if (compareExactTemporalValues(end, start) <= 0) {
      throw new NarrativeCaptionTimingError("CAPTION_UNIT_WINDOW",
        `CaptionDocument ${document.id} -> Unit ${unit.id} resolves to an empty or reversed local range.`);
    }
    timed.push({ unitId: unit.id, regions: [{
      start: { position: structuredClone(start), side: "after" },
      end: { position: structuredClone(end), side: "before" },
    }] });
  }
  const result: LocalCaptionTiming = {
    documentId: document.id,
    domain: structuredClone(timing.domain),
    units: timed,
  };
  assertLocalCaptionTiming(result);
  return result;
}
