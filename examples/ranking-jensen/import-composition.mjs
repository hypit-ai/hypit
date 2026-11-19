import { randomUUID } from "node:crypto";
import { link, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { serializeNleProject } from "@hypit/nle";
import { materializeComposition } from "@hypit/nle/authoring";
import { createNodeProjectResourceResolver, openNodeProjectHost } from "@hypit/project/node";
import compose, { mediaInputs, project } from "./.hypit/authoring/main.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const destination = new URL("./film.from-source.svml", import.meta.url);
const host = await openNodeProjectHost({ root });
const resolveResource = createNodeProjectResourceResolver(root);
let staging;
try {
  const media = new Map(await Promise.all(mediaInputs.map(async path => {
    const { interpretation } = await host.media.resolveMedia({ path }, resolveResource);
    return [path, { duration: interpretation.domain?.duration,
      picture: interpretation.picture !== undefined, audio: interpretation.audio !== undefined }];
  })));
  const edit = materializeComposition(project, compose, media);
  staging = new URL(`./.film.from-source.${randomUUID()}.writing`, import.meta.url);
  await writeFile(staging, serializeNleProject(edit), { flag: "wx" });
  try {
    await link(staging, destination);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("film.from-source.svml already exists. Move it aside before importing a new copy.");
    throw error;
  }
  const { tracks, transitions } = edit.compositions[0];
  console.log(`Created ${fileURLToPath(destination)} · ${tracks.length} tracks · ${tracks.reduce((n, track) => n + track.items.length, 0)} items · ${transitions.length} transitions`);
} finally {
  try { if (staging !== undefined) await rm(staging, { force: true }); }
  finally { await host.close(); }
}
