import { gptImage2, gptImage25Flare, gptImage25Sunburst } from "./index.js";

const name = "@hypit/gpt-image";
const models = [gptImage2, gptImage25Flare, gptImage25Sunburst];

export const hypitPackage = {
  package: name,
  contributions: models.map(model => ({ kind: "canvas.model", value: model })),
  catalog: models.map(model => ({
    id: model.id.slice(name.length + 1), kind: "canvas.model", title: model.title, value: model.id,
  })),
};
