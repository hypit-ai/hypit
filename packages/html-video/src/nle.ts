import type { NleProject } from "@hypit/nle";
import type { MediaDeliverySpec } from "@hypit/media";
import {
  linkNleProjectAudiovisual,
  lowerNleAudiovisualToAudioProgram,
  lowerNleAudiovisualToHtmlProgram,
  type NleAudiovisualLinkHost,
  type NlePictureOutputSelection,
} from "@hypit/nle-audiovisual";

import { createHtmlVideoDeliveryPlan } from "./delivery.js";
import type { HtmlVideoDeliveryPlan } from "./delivery.js";
/**
 * Downstream adapter from one editable NLE Project to full delivery requests.
 * Picture and Audio share one AVIR lowering; a picture-only Project receives exact silence.
 */
export function lowerNleProjectToHtmlVideoDeliveryPlan(
  project: NleProject,
  host: NleAudiovisualLinkHost,
  output: NlePictureOutputSelection,
  delivery: MediaDeliverySpec,
): HtmlVideoDeliveryPlan {
  const lowering = linkNleProjectAudiovisual(project, host);
  const visual = lowerNleAudiovisualToHtmlProgram(lowering, output);
  const audio = lowerNleAudiovisualToAudioProgram(
    lowering,
    { sampleRate: delivery.audio.sampleRate },
    { silenceWhenAbsent: true },
  );
  return createHtmlVideoDeliveryPlan(visual, audio, delivery);
}
