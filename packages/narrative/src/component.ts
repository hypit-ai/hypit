import type { ComponentPackage } from "@hypit/component-kit";
import type { StoredValue } from "@hypit/protocol";

import {
  assertCaptionDocumentIdentity,
  assertNarrativeExcerptIdentity,
  assertNarrativeIdentity,
  assertNarrativeMomentRefIdentity,
  assertNarrativeSelectionRefIdentity,
} from "./identity.js";
import { narrativeTypes } from "./manifest.js";
import type {
  CaptionDocument,
  Narrative,
  NarrativeExcerpt,
  NarrativeMomentRef,
  NarrativeSelectionRef,
} from "./types.js";

function inline<T>(value: StoredValue, subject: string): T {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline.`);
  return value.value as T;
}

export const narrativeComponent = {
  validators: [
    { type: narrativeTypes.narrative, handler: ({ value }) => assertNarrativeIdentity(inline<Narrative>(value, "Narrative")) },
    { type: narrativeTypes.excerpt, handler: ({ value }) => assertNarrativeExcerptIdentity(inline<NarrativeExcerpt>(value, "NarrativeExcerpt")) },
    { type: narrativeTypes.selection, handler: ({ value }) => assertNarrativeSelectionRefIdentity(inline<NarrativeSelectionRef>(value, "NarrativeSelection")) },
    { type: narrativeTypes.moment, handler: ({ value }) => assertNarrativeMomentRefIdentity(inline<NarrativeMomentRef>(value, "NarrativeMoment")) },
    { type: narrativeTypes.captionDocument, handler: ({ value }) => assertCaptionDocumentIdentity(inline<CaptionDocument>(value, "CaptionDocument")) },
  ],
} satisfies ComponentPackage;
