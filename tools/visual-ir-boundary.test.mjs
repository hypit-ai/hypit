import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { compositionSchema } from "@narratage/composition";
import { VISUAL_STYLE_NAMES_V1 } from "@narratage/visual-ir";

function schemaFieldNames(schema, found = new Set()) {
  if (schema === null || typeof schema !== "object") return found;
  if (schema.kind === "object") {
    for (const [name, field] of Object.entries(schema.fields ?? {})) {
      found.add(name);
      schemaFieldNames(field.schema, found);
    }
  }
  if (schema.kind === "array") schemaFieldNames(schema.items, found);
  if (schema.kind === "oneOf") for (const variant of schema.variants ?? []) schemaFieldNames(variant, found);
  return found;
}

async function packageManifest(name) {
  return JSON.parse(await readFile(new URL(`../packages/${name}/package.json`, import.meta.url), "utf8"));
}

async function typescriptSources(directory) {
  const result = [];
  const visit = async (root) => {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const child = new URL(`./${entry.name}${entry.isDirectory() ? "/" : ""}`, root);
      if (entry.isDirectory()) await visit(child);
      else if (entry.name.endsWith(".ts")) result.push({ path: child, source: await readFile(child, "utf8") });
    }
  };
  await visit(new URL(`../packages/${directory}/src/`, import.meta.url));
  return result;
}

test("the public Composition waist has no author-family, Provider or cross-Track input field", () => {
  const fields = schemaFieldNames(compositionSchema);
  const forbidden = [
    "authorFamily",
    "caption",
    "component",
    "family",
    "lowerComposite",
    "mediaTrack",
    "provider",
    "ranking",
    "recipe",
    "selector",
    "siblingTrack",
    "sourceTrack",
    "trackRef",
  ];
  assert.deepEqual(forbidden.filter((field) => fields.has(field)), []);
  assert.ok(fields.has("visualIr") && fields.has("presents") && fields.has("elements"),
    "the audit must be inspecting the actual public VisualTrack schema");
  assert.equal(VISUAL_STYLE_NAMES_V1.includes("backdrop-filter"), false);
  assert.equal(VISUAL_STYLE_NAMES_V1.includes("mix-blend-mode"), false);
});

test("Composition and render adapters reach no author-package family", async () => {
  const authorPackages = new Set([
    "@narratage/audio-track",
    "@narratage/caption",
    "@narratage/caption-fine",
    "@narratage/deck-track",
    "@narratage/media-track",
    "@narratage/ranking",
    "@narratage/screen-overlay",
    "@narratage/typography-track",
  ]);
  for (const name of ["composition", "hyperframes", "render-hyperframes", "provider-hyperframes-local"]) {
    const manifest = await packageManifest(name);
    const dependencies = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ]);
    assert.deepEqual([...authorPackages].filter((dependency) => dependencies.has(dependency)), [],
      `${manifest.name} depends on an author-package family`);
  }
});

test("the terminal compiler contains no hidden accumulated-composite sampling path", async () => {
  const forbidden = [
    /backdrop-filter/u,
    /mix-blend-mode/u,
    /lowerComposite/u,
    /siblingTrack/u,
    /sourceTrack/u,
    /trackRef/u,
    /@narratage\/(?:caption(?:-fine)?|deck-track|media-track|ranking|screen-overlay|text-track)/u,
  ];
  const failures = [];
  for (const directory of ["hyperframes", "render-hyperframes"]) {
    for (const item of await typescriptSources(directory)) {
      for (const pattern of forbidden) {
        if (pattern.test(item.source)) failures.push(`${item.path.pathname}: ${pattern}`);
      }
    }
  }
  assert.deepEqual(failures, [], `terminal renderer boundary leaked author/cross-Track semantics:\n${failures.join("\n")}`);
});
