import { miMoVoiceDesign, miMoVoiceClone } from "./index.js";

const name = "@hypit/mimo-speech";
const models = [miMoVoiceDesign, miMoVoiceClone];

export const hypitPackage = {
  package: name,
  contributions: models.map(model => ({ kind: "canvas.model", value: model })),
  catalog: models.map(model => ({
    id: model.id.slice(name.length + 1), kind: "canvas.model", title: model.title, value: model.id,
  })),
};
