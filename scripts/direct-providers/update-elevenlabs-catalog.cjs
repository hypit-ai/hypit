const fs = require("node:fs");
if (!process.argv[2])
  throw new Error(
    "Usage: node scripts/direct-providers/update-elevenlabs-catalog.cjs <downloaded-official-openapi.json>",
  );
const s = JSON.parse(fs.readFileSync(process.argv[2])).components.schemas;
const camel = (x) => x.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const scalar = (p) =>
  p.enum
    ? { kind: "enum", values: p.enum }
    : p.type === "boolean"
      ? { kind: "boolean" }
      : ["number", "integer"].includes(p.type)
        ? {
            kind: "number",
            ...(p.type === "integer" ? { integer: true } : {}),
            ...(p.minimum !== undefined ? { minimum: p.minimum } : {}),
            ...(p.maximum !== undefined ? { maximum: p.maximum } : {}),
          }
        : { kind: "text", ...(p.maxLength ? { maxChars: p.maxLength } : {}) };
const entries = [];
for (const [union, result] of [
  ["ImageGenerationRequest", "image"],
  ["VideoGenerationRequest", "video"],
]) {
  for (const [model, ref] of Object.entries(s[union].discriminator.mapping)) {
    const schema = s[ref.split("/").pop()],
      ports = [],
      fields = {};
    for (const [field, raw] of Object.entries(schema.properties)) {
      if (["webhook", "model_id"].includes(field)) continue;
      let p = raw.anyOf ? raw.anyOf.find((x) => x.type !== "null") : raw;
      const item = p.type === "array" ? p.items : p;
      const refname = item.$ref?.split("/").pop();
      const role = /ImageReference/.test(refname)
        ? "image"
        : refname === "VideoReference"
          ? "video"
          : refname === "AudioReference"
            ? "audio"
            : null;
      if (role) {
        const value = { kind: "media", accepts: [role] };
        if (refname === "VeoImageReference")
          value.itemFields = [
            {
              name: "referenceRole",
              value: { kind: "enum", values: ["subject", "style"] },
            },
          ];
        ports.push({
          name: camel(field),
          value,
          minItems: schema.required.includes(field) ? 1 : 0,
          maxItems: p.type === "array" ? p.maxItems : 1,
        });
        fields[camel(field)] = {
          field,
          array: p.type === "array",
          ...(refname === "VeoImageReference" ? { veo: true } : {}),
        };
      } else {
        if (!["string", "number", "integer", "boolean"].includes(p.type))
          throw Error(field);
        ports.push({
          name: camel(field),
          value: scalar(p),
          minItems: schema.required.includes(field) ? 1 : 0,
          maxItems: 1,
        });
        fields[camel(field)] = { field };
      }
    }
    const requires = [];
    const names = ports.map((p) => p.name);
    if (names.includes("mask"))
      requires.push({
        kind: "requiresPresent",
        port: "mask",
        needs: ["images"],
      });
    for (const frame of ["startFrame", "endFrame"])
      for (const reference of ["images", "videos", "audios"])
        if (names.includes(frame) && names.includes(reference))
          requires.push({ kind: "atMostOneOf", ports: [frame, reference] });
    if (
      [
        "bytedance-seedance-v2",
        "bytedance-seedance-v2-fast",
        "bytedance-seedance-v2-mini",
      ].includes(model)
    )
      requires.push({
        kind: "requiresAnyOf",
        port: "audios",
        anyOf: ["images", "videos"],
      });
    entries.push({
      model,
      result,
      path: "/v1/flows/" + result,
      fields,
      ports,
      requires,
      gated: model.startsWith("bytedance-"),
    });
  }
}
fs.mkdirSync("packages/elevenlabs-models/src", { recursive: true });
const path = "packages/elevenlabs-models/src/catalog.json";
const voice = JSON.parse(fs.readFileSync(path)).filter((m) => m.operation);
fs.writeFileSync(path, JSON.stringify([...entries, ...voice], null, 2) + "\n");
console.log("ElevenLabs image/video model definitions:", entries.length);
