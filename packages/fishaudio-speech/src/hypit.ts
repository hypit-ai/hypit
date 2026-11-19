import { fishVoiceDesign, fishVoiceClone, fishS21ProFree } from "./index.js";

const name = "@hypit/fishaudio-speech";
const models = [fishVoiceDesign, fishVoiceClone, fishS21ProFree];

export const hypitPackage = {
  package: name,
  contributions: models.map(model => ({ kind: "canvas.model", value: model })),
  catalog: models.map(model => ({
    id: model.id.slice(name.length + 1), kind: "canvas.model", title: model.title, value: model.id,
  })),
};
