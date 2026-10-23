import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Value } from "@hypit/hypit/protocol";

import {
  assertNarrativeSegmentRefIdentity,
  assertNarrativeIdentity,
  assertNarrativeMomentRefIdentity,
  assertNarrativeSelectionRefIdentity,
} from "./identity.js";
import { narrativeTypes } from "./manifest.js";
import type {
  Narrative,
  NarrativeSegmentRef,
  NarrativeMomentRef,
  NarrativeSelectionRef,
} from "./types.js";

function valueOf<T>(value: Value, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing.`);
  return value as T;
}

export const narrativeComponent = {
  refinements: [
    { type: narrativeTypes.narrative, handler: ({ value }) => assertNarrativeIdentity(valueOf<Narrative>(value, "Narrative")) },
    { type: narrativeTypes.segmentRef, handler: ({ value }) => assertNarrativeSegmentRefIdentity(valueOf<NarrativeSegmentRef>(value, "NarrativeSegmentRef")) },
    { type: narrativeTypes.selection, handler: ({ value }) => assertNarrativeSelectionRefIdentity(valueOf<NarrativeSelectionRef>(value, "NarrativeSelection")) },
    { type: narrativeTypes.moment, handler: ({ value }) => assertNarrativeMomentRefIdentity(valueOf<NarrativeMomentRef>(value, "NarrativeMoment")) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
