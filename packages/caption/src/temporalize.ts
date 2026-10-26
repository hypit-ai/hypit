import { assertCaptionDocumentIdentity } from "./identity.js";
import type { CaptionDocument, CaptionTiming } from "./types.js";
import { assertFrameSpan } from "@hypit/timeline";

export function assertCaptionTiming(timing: CaptionTiming): void {
  if (timing.timelineId.length === 0 || timing.documentId.length === 0) {
    throw new Error("CaptionTiming provenance is invalid");
  }
  const unitIds = new Set<string>();
  for (const unit of timing.units) {
    try {
      assertFrameSpan(unit);
    } catch {
      throw new Error("CaptionTiming contains an invalid or repeated unit timing");
    }
    if (unit.unitId.length === 0 || unitIds.has(unit.unitId)) {
      throw new Error("CaptionTiming contains an invalid or repeated unit timing");
    }
    unitIds.add(unit.unitId);
  }
}

/** Verify the named join without imposing array order or global temporal monotonicity. */
export function assertCaptionTimingForDocument(timing: CaptionTiming, document: CaptionDocument): void {
  assertCaptionTiming(timing);
  assertCaptionDocumentIdentity(document);
  if (timing.documentId !== document.id) throw new Error("CaptionTiming belongs to another CaptionDocument");
  const expected = new Set(document.units.map((unit) => unit.id));
  const actual = new Set(timing.units.map((unit) => unit.unitId));
  const missing = [...expected].filter((id) => !actual.has(id));
  const unknown = [...actual].filter((id) => !expected.has(id));
  if (missing.length > 0 || unknown.length > 0) {
    const details = [
      ...(missing.length === 0 ? [] : [`missing ${missing.join(", ")}`]),
      ...(unknown.length === 0 ? [] : [`unknown ${unknown.join(", ")}`]),
    ].join("; ");
    throw new Error(`CaptionTiming must cover CaptionDocument units exactly (${details})`);
  }
}
