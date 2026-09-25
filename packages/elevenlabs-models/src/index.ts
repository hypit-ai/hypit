import raw from "./catalog.json" with { type: "json" };
import { createDirectModels, assert } from "@hypit/direct-model-kit";
import type { DirectModel } from "@hypit/direct-model-kit";
export const catalog = raw as readonly DirectModel[];
export const models = createDirectModels(
  "@hypit/elevenlabs-models",
  catalog,
  (m, r) => {
    if (m.model.startsWith("veo-") && r.ports.images && r.ports.durationSecs)
      assert(
        r.ports.durationSecs[0] === 8,
        "Veo reference images require durationSecs=8",
      );
    if (m.operation === "dialogue" && r.ports.texts && r.ports.voiceIds)
      assert(
        r.ports.texts.length === r.ports.voiceIds.length,
        "Dialogue texts and voiceIds must have equal lengths",
      );
  },
);
export const hypitPackage = models.hypitPackage;
