import assert from "node:assert/strict";
import {
  readdir,
  readFile,
} from "node:fs/promises";
import test from "node:test";

const packageRoot = new URL("../packages/", import.meta.url);

async function sourceFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = new URL(`./${entry.name}${entry.isDirectory() ? "/" : ""}`, root);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}

async function contents(packageNames) {
  const result = [];
  for (const name of packageNames) {
    const root = new URL(`./${name}/src/`, packageRoot);
    for (const path of await sourceFiles(root)) {
      result.push({ path, source: await readFile(path, "utf8") });
    }
  }
  return result;
}

const domainValuePackages = [
  "media-track",
  "caption",
  "caption-gemini",
  "estimate",
  "film",
  "generation",
  "hyperframes",
  "render-hyperframes",
  "image-transform",
  "media-pipeline",
  "text",
  "script",
  "seedance",
  "speech-alignment",
  "speech-spine",
  "speech-basis",
  "typography-track",
  "whisperx",
];

const forbiddenLineageFields = [
  "programSpaceDigest",
  "narrativeDigest",
  "mapDigest",
  "selectionDigest",
  "excerptDigest",
  "basisDigest",
  "resultDigest",
  "productDigest",
  "planDigest",
  "captionProgramDigest",
  "sourceAudioArtifactDigest",
  "renderInputDigest",
  "visualDigest",
  "audioDigest",
  "inspectionDigest",
  "previousSetDigest",
  "trackDigest",
];

test("domain Products do not copy graph lineage into payload fields", async () => {
  for (const { path, source } of await contents(domainValuePackages)) {
    for (const field of forbiddenLineageFields) {
      assert.doesNotMatch(source, new RegExp(`\\b${field}\\b`, "u"), `${path.pathname} reintroduced ${field}`);
    }
    assert.doesNotMatch(
      source,
      /readonly\s+digest\s*:\s*Digest\b/u,
      `${path.pathname} reintroduced a domain Product self-digest`,
    );
  }
});

test("the generic graph stack has no payload-affinity side channel", async () => {
  const genericSources = await contents(["protocol", "core", "elaborator"]);
  const removedApi = [
    "ResultAffinityDeclaration",
    "AffinityConstraint",
    "FragmentAffinityConstraint",
    "verifyRecordAffinity",
  ];
  for (const { path, source } of genericSources) {
    for (const symbol of removedApi) {
      assert.doesNotMatch(source, new RegExp(`\\b${symbol}\\b`, "u"), `${path.pathname} reintroduced ${symbol}`);
    }
  }
});

test("fold values retain members, not hidden identity or policy context", async () => {
  const declarations = [
    ["media-track", "types.ts", "MediaTrackSet"],
    ["film", "types.ts", "FilmTrackSet"],
    ["speech-spine", "types.ts", "SpeechSpineSet"],
    ["typography-track", "types.ts", "TypographyTrackSet"],
  ];
  for (const [packageName, fileName, typeName] of declarations) {
    const path = new URL(`./${packageName}/src/${fileName}`, packageRoot);
    const source = await readFile(path, "utf8");
    const declaration = new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\n\\};`, "u").exec(source)?.[1];
    assert.ok(declaration, `${typeName} declaration is missing`);
    assert.doesNotMatch(
      declaration,
      /readonly\s+(?:id|digest|program|programSpace)\s*:/u,
      `${typeName} carries hidden identity or policy context`,
    );
  }
});
