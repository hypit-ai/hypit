import { minimaxH3 } from "./index.js";

const name = "@hypit/minimax-h3";
const models = [minimaxH3];

export const hypitPackage = {
  package: name,
  contributions: models.map(model => ({ kind: "canvas.model", value: model })),
  catalog: models.map(model => ({
    id: model.id.slice(name.length + 1), kind: "canvas.model", title: model.title, value: model.id,
  })),
};
