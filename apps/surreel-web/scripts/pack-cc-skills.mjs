#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const source = process.env.SURREEL_CC_SKILLS ?? join(app, "..", "..", "..", "surreel-cc", "skills");
const required = [
  "ad-story-framework",
  "gpt-image-people",
  "h3-video",
  "seedance-home-video",
  "ugc-ad-formats",
  "ugc-realistic",
];

function read(path) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n").trim();
}

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: match[2].trim() };
}

function plannerCard(markdown, limit) {
  const keep = [];
  let afterHeading = 0;
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,3} /.test(trimmed)) {
      keep.push(trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
      afterHeading = 2;
      continue;
    }
    const useful =
      afterHeading > 0 ||
      /^[-*] |\d+\. |^>/.test(trimmed) ||
      /\b(must|never|always|required|do not|don't|prompt|image_urls|generate_audio|iphone|handheld|facetimes|no text|json|catchlight|photoreal)\b/i.test(
        trimmed,
      );
    if (!useful) continue;
    keep.push(trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
    if (afterHeading > 0) afterHeading -= 1;
  }
  let text = keep.join("\n");
  if (text.length > limit) text = text.slice(0, limit).replace(/\s+\S*$/, "").trim();
  return text;
}

if (!existsSync(source)) {
  console.error(`surreel-cc skills not found at ${source}`);
  process.exit(1);
}

const pack = {};
for (const name of required) {
  const skillPath = join(source, name, "SKILL.md");
  if (!existsSync(skillPath)) {
    console.error(`missing ${skillPath}`);
    process.exit(1);
  }
  const raw = read(skillPath);
  const { meta, body } = frontmatter(raw);
  const kinds = String(meta.kinds ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (kinds.length === 0) {
    console.error(`${name} declares no kinds`);
    process.exit(1);
  }
  pack[name] = {
    name: meta.name ?? name,
    description: meta.description ?? "",
    kinds,
    plannerText: plannerCard(body, 2400),
  };
}

const names = readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(source, entry.name, "SKILL.md")))
  .map((entry) => entry.name)
  .sort();
for (const name of required) {
  if (!names.includes(name)) {
    console.error(`${name} is required from surreel-cc and is missing`);
    process.exit(1);
  }
}

const formats = JSON.parse(readFileSync(join(app, "worker", "format-skills.json"), "utf8"));
const routes = Object.fromEntries(
  formats.map((format) => [format.id, { imageSkills: format.imageSkills, videoSkills: format.videoSkills }]),
);
for (const format of formats) {
  for (const name of [...format.imageSkills, ...format.videoSkills]) {
    if (!pack[name]) {
      console.error(`format ${format.id} points at unpacked skill ${name}`);
      process.exit(1);
    }
  }
}

const out = join(app, "worker", "cc-skills-pack.ts");
writeFileSync(
  out,
  [
    `/* Generated from ${source}. Do not edit. */`,
    `export const ccSkillsPack = ${JSON.stringify(pack, null, 2)} as const;`,
    `export const ccFormatRoutes = ${JSON.stringify(routes, null, 2)} as const;`,
    "",
  ].join("\n"),
);
console.info(`Packed ${Object.keys(pack).length} surreel-cc skills → worker/cc-skills-pack.ts (${Buffer.byteLength(readFileSync(out))} bytes)`);
