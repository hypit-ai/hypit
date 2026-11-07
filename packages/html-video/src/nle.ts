import type { NleProject } from "@hypit/nle";
import type { MediaDeliverySpec } from "@hypit/media";
import type { TemporalRate } from "@hypit/temporal/algebra";

import { createHtmlVideoDeliveryPlan } from "./delivery.js";
import type { HtmlVideoDeliveryPlan } from "./delivery.js";
import {
  linkNleProjectTerminals,
  lowerNleAudiovisualToAudioProgram,
  lowerNleAudiovisualToHtmlProgram,
  type NleTerminalLinkHost,
} from "./nle-link.js";

/**
 * Downstream adapter from one editable NLE Project to full delivery requests.
 * Picture and Audio share one AVIR lowering; a picture-only Project receives exact silence.
 */
export function lowerNleProjectToHtmlVideoDeliveryPlan(
  project: NleProject,
  host: NleTerminalLinkHost,
  frameRate: TemporalRate,
  delivery: MediaDeliverySpec,
): HtmlVideoDeliveryPlan {
  const lowering = linkNleProjectTerminals(project, host);
  const visual = lowerNleAudiovisualToHtmlProgram(project, lowering, frameRate);
  const audio = lowerNleAudiovisualToAudioProgram(
    lowering,
    { sampleRate: delivery.audio.sampleRate },
    { silenceWhenAbsent: true },
  );
  return createHtmlVideoDeliveryPlan(visual, audio, delivery);
}
