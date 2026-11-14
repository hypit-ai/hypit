import { nleTimeMappingRequiredDuration } from "@hypit/nle";
import type { NleInspectorFieldDraft, NleInspectorOperatorPresentation } from "@hypit/nle-view";

import { assertPictureFilterNleParameters, pictureFilterNleSymbol } from "./nle.js";
import type { PictureFilterState } from "./program.js";

function stateFields(state: PictureFilterState): NleInspectorFieldDraft[] {
  const number = (id: keyof PictureFilterState, label: string, unit?: string): NleInspectorFieldDraft => ({
    id, label, control: "number", value: state[id], ...(unit === undefined ? {} : { unit }),
    edit: (value) => ({ kind: "set-constant-state", state: { ...structuredClone(state), [id]: value } }),
  });
  return [
    number("opacity", "不透明度"),
    number("blurRadius", "模糊", "px"),
    number("brightness", "亮度"),
    number("contrast", "对比度"),
    number("saturation", "饱和度"),
    number("hue", "色相", "°"),
    number("grayscale", "灰度"),
    number("sepia", "棕褐"),
    number("invert", "反相"),
  ];
}

export const pictureFilterNleInspector: NleInspectorOperatorPresentation = {
  operator: pictureFilterNleSymbol,
  project: ({ application }) => {
    assertPictureFilterNleParameters(application.parameters,
      nleTimeMappingRequiredDuration(application.controlTime));
    return application.parameters.kind === "constant" ? [{
      id: "filter-state", label: "滤镜", domain: "how", page: { id: "appearance", label: "外观" },
      fields: stateFields(application.parameters.state),
    }] : [{
      id: "filter-animation", label: "滤镜动画", domain: "when", page: { id: "motion", label: "动画" }, fields: [
        { id: "keyframes", label: "关键帧", control: "readout", value: `${application.parameters.keyframes.length} 个` },
        { id: "interpolation", label: "插值", control: "readout", value: application.parameters.interpolation.kind },
      ],
    }];
  },
};
