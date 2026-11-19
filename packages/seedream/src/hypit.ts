import { seedream5Lite, seedream5Pro } from "./index.js";

const name = "@hypit/seedream";
const models = [seedream5Lite, seedream5Pro];

export const hypitPackage = {
  package: name,
  contributions: models.map(model => ({ kind: "canvas.model", value: model })),
  catalog: models.map(model => ({
    id: model.id.slice(name.length + 1), kind: "canvas.model", title: model.title, value: model.id,
  })),
};
