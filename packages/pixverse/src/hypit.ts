import { pixverseV6, pixverseC1 } from "./index.js";

const name = "@hypit/pixverse";
const models = [pixverseV6, pixverseC1];

export const hypitPackage = {
  package: name,
  contributions: models.map(model => ({ kind: "canvas.model", value: model })),
  catalog: models.map(model => ({
    id: model.id.slice(name.length + 1), kind: "canvas.model", title: model.title, value: model.id,
  })),
};
