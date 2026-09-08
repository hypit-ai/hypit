import { plannedNeedInputs } from "@hypit/component-kit";
import type { ComponentPackage } from "@hypit/component-kit";
import type { SpeechEvidenceAudio } from "@hypit/speech";
import type { CanonicalValue, StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";

import { whisperXRequestForEvidenceAudio } from "./evidence.js";
import { whisperXCapabilities, whisperXProducers } from "./manifest.js";
import type { WhisperXLanguage } from "./types.js";

function inline(value: StoredValue, subject: string): CanonicalValue {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

export const whisperXComponent = {
  producers: [
    {
      producer: whisperXProducers.request,
      handler: ({ inputs }) => {
        const evidence = inline(inputs.evidence!.value, "SpeechEvidenceAudio") as unknown as SpeechEvidenceAudio;
        const language = inline(inputs.language!.value, "WhisperXLanguage") as unknown as WhisperXLanguage;
        if (language !== "en" && language !== "zh" && language !== "es") {
          throw new Error("WhisperXLanguage must be en, zh, or es");
        }
        return {
          outputs: {},
          needs: { alignment: canonicalize(whisperXRequestForEvidenceAudio(evidence, { language })) },
        };
      },
    },
  ],
  plannedNeeds: [{
    producer: whisperXProducers.request,
    port: "alignment",
    capability: whisperXCapabilities.alignment,
    plan({ state, step }) {
      const operation = state.plan.steps.find((item) => item.id === step);
      const languageRecord = operation?.inputs.language;
      const language = languageRecord === undefined
        ? undefined
        : state.records.find((record) => record.id === languageRecord)?.value;
      if (language?.kind !== "inline" || typeof language.value !== "string") return undefined;
      return {
        constraints: { language: language.value },
        pendingInputs: plannedNeedInputs(state, step, { evidence: "audio" }),
      };
    },
    present(specification) {
      const fields = specification.constraints !== null
        && typeof specification.constraints === "object"
        && !Array.isArray(specification.constraints)
        ? specification.constraints as Readonly<Record<string, CanonicalValue>>
        : {};
      const language = typeof fields.language === "string" ? fields.language : undefined;
      return {
        fields: language === undefined ? {} : { language: [language] },
        references: {
          audio: specification.pendingInputs.filter((input) => input.role === "audio").length,
        },
      };
    },
  }],
} satisfies ComponentPackage;
