import {
  lowerNleAudiovisualToAudioProgram,
  lowerNleAudiovisualToHtmlProgram,
  lowerNleProjectToAudiovisual,
} from "@hypit/nle";
import type { NleLoweringHost, NleProject } from "@hypit/nle";
import type { MediaDeliverySpec } from "@hypit/media";

import { createHtmlVideoDeliveryPlan } from "./delivery.js";
import type { HtmlVideoDeliveryPlan } from "./delivery.js";

/**
 * Downstream adapter from one editable NLE Project to full delivery requests.
 * Picture and Audio share one AVIR lowering; a picture-only Project receives exact silence.
 */
export function lowerNleProjectToHtmlVideoDeliveryPlan(
  project: NleProject,
  host: NleLoweringHost,
  delivery: MediaDeliverySpec,
): HtmlVideoDeliveryPlan {
  const lowering = lowerNleProjectToAudiovisual(project, host);
  const visual = lowerNleAudiovisualToHtmlProgram(project, lowering);
  const audio = lowerNleAudiovisualToAudioProgram(
    lowering,
    { sampleRate: delivery.audio.sampleRate },
    { silenceWhenAbsent: true },
  );
  return createHtmlVideoDeliveryPlan(visual, audio, delivery);
}
