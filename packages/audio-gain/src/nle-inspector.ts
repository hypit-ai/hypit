import type { NleInspectorAdjustmentPresentation } from "@hypit/nle-view";

import { assertAudioGainNleParameters, audioGainNleSymbol } from "./nle.js";

export const audioGainNleInspector: NleInspectorAdjustmentPresentation = {
  component: audioGainNleSymbol,
  project: ({ item }) => {
    assertAudioGainNleParameters(item.parameters, item.duration);
    return item.parameters.kind === "constant" ? [{
      id: "audio-gain", label: "音量", domain: "how", page: { id: "sound", label: "声音" }, fields: [
        { id: "gain", label: "增益", control: "number", value: item.parameters.gain,
          edit: (value) => ({ kind: "set-constant-gain", gain: value }) },
      ],
    }] : [{
      id: "audio-gain-animation", label: "音量动画", domain: "when", page: { id: "motion", label: "动画" }, fields: [
        { id: "keyframes", label: "关键帧", control: "readout", value: `${item.parameters.keyframes.length} 个` },
        { id: "interpolation", label: "插值", control: "readout", value: item.parameters.interpolation.kind },
      ],
    }];
  },
};
