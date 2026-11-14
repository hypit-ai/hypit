import { nleTimeMappingRequiredDuration } from "@hypit/nle";
import type { NleInspectorOperatorPresentation } from "@hypit/nle-view";

import { assertAudioGainNleParameters, audioGainNleSymbol } from "./nle.js";

export const audioGainNleInspector: NleInspectorOperatorPresentation = {
  operator: audioGainNleSymbol,
  project: ({ application }) => {
    assertAudioGainNleParameters(application.parameters,
      nleTimeMappingRequiredDuration(application.controlTime));
    return application.parameters.kind === "constant" ? [{
      id: "audio-gain", label: "音量", domain: "how", page: { id: "sound", label: "声音" }, fields: [
        { id: "gain", label: "增益", control: "number", value: application.parameters.gain,
          edit: (value) => ({ kind: "set-constant-gain", gain: value }) },
      ],
    }] : [{
      id: "audio-gain-animation", label: "音量动画", domain: "when", page: { id: "motion", label: "动画" }, fields: [
        { id: "keyframes", label: "关键帧", control: "readout", value: `${application.parameters.keyframes.length} 个` },
        { id: "interpolation", label: "插值", control: "readout", value: application.parameters.interpolation.kind },
      ],
    }];
  },
};
