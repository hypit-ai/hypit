import { nleTimeMappingRequiredDuration } from "@hypit/nle";
import type { NleInspectorFieldDraft, NleInspectorOperatorPresentation } from "@hypit/nle-view";

import { assertPictureTransformNleParameters, pictureTransformNleSymbol } from "./nle.js";
import type { PictureTransformState } from "./program.js";

function stateFields(state: PictureTransformState): NleInspectorFieldDraft[] {
  const number = (id: keyof PictureTransformState, label: string, unit?: string): NleInspectorFieldDraft => ({
    id, label, control: "number", value: state[id], ...(unit === undefined ? {} : { unit }),
    edit: (value) => ({ kind: "set-constant-state", state: { ...structuredClone(state), [id]: value } }),
  });
  return [
    number("translateX", "X 位移"),
    number("translateY", "Y 位移"),
    number("scaleX", "X 缩放"),
    number("scaleY", "Y 缩放"),
    number("rotationDegrees", "旋转", "°"),
    number("originX", "X 原点"),
    number("originY", "Y 原点"),
  ];
}

export const pictureTransformNleInspector: NleInspectorOperatorPresentation = {
  operator: pictureTransformNleSymbol,
  project: ({ application }) => {
    assertPictureTransformNleParameters(application.parameters,
      nleTimeMappingRequiredDuration(application.controlTime));
    return application.parameters.kind === "constant" ? [{
      id: "transform-state", label: "变换", domain: "where", page: { id: "layout", label: "布局" },
      fields: stateFields(application.parameters.state),
    }] : [{
      id: "transform-animation", label: "变换动画", domain: "when", page: { id: "motion", label: "动画" }, fields: [
        { id: "keyframes", label: "关键帧", control: "readout", value: `${application.parameters.keyframes.length} 个` },
        { id: "interpolation", label: "插值", control: "readout", value: application.parameters.interpolation.kind },
      ],
    }];
  },
};
