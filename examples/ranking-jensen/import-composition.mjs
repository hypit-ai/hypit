import { randomUUID } from "node:crypto";
import { link, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import ts from "typescript";
import { serializeNleProject } from "@hypit/nle";
import { materializeComposition } from "@hypit/nle/authoring";
import { createNodeProjectResourceResolver, openNodeProjectHost } from "@hypit/project/node";
import { parseScript } from "@hypit/script";
import { decodeTimedTranscript } from "@hypit/timed-transcript";

const root = fileURLToPath(new URL(".", import.meta.url));
const { values } = parseArgs({ options: { to: { type: "string", default: "film.from-source.svml" } } });
const destination = resolve(root, values.to);
if (dirname(destination) !== resolve(root) || !destination.endsWith(".svml")) {
  throw new Error("Choose an .svml destination in the Jensen Project root so the output can resolve its Media.");
}

async function loadComposition() {
  const config = resolve(root, "authors/tsconfig.json");
  const read = ts.readConfigFile(config, ts.sys.readFile);
  const diagnosticHost = { getCanonicalFileName: name => name, getCurrentDirectory: () => root, getNewLine: () => "\n" };
  const fail = diagnostics => { throw new Error(ts.formatDiagnostics(diagnostics, diagnosticHost)); };
  if (read.error) fail([read.error]);
  const { fileNames, options, errors } = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(config));
  if (errors.length > 0) fail(errors);
  const emitted = new Map();
  const program = ts.createProgram(fileNames, options);
  const result = program.emit(undefined, (path, source) => emitted.set(pathToFileURL(path).href, source));
  if (result.emitSkipped) fail(result.diagnostics);

  const entry = pathToFileURL(resolve(options.outDir, "main.js")).href;
  if (!emitted.has(entry)) throw new Error("The author compiler did not emit main.tsx.");

  // Import the compiled project modules from memory for this evaluation only.
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("file:") || (context.parentURL && /^\.\.?\//u.test(specifier))) {
        const url = new URL(specifier, context.parentURL).href;
        if (emitted.has(url)) return { url, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (emitted.has(url)) return { format: "module", source: emitted.get(url), shortCircuit: true };
      return nextLoad(url, context);
    },
  });
  try { return await import(entry); }
  finally { hooks.deregister(); }
}

const { default: compose, mediaInputs, project, takes } = await loadComposition();
const scriptPath = resolve(root, "documents/jensen.script");
const script = parseScript(scriptPath, await readFile(scriptPath, "utf8"));
const transcripts = new Map(await Promise.all(takes.map(async take => {
  const path = resolve(root, "documents/transcripts", `${take}.json`);
  return [take, decodeTimedTranscript(await readFile(path, "utf8"), path)];
})));
const host = await openNodeProjectHost({ root });
const resolveResource = createNodeProjectResourceResolver(root);
let staging;
try {
  const media = new Map(await Promise.all(mediaInputs.map(async path => {
    const { interpretation } = await host.media.resolveMedia({ path }, resolveResource);
    return [path, interpretation];
  })));
  const edit = materializeComposition(project, compose, { media, script, transcripts });
  const contents = serializeNleProject(edit);
  staging = resolve(dirname(destination), `.${basename(destination)}.${randomUUID()}.writing`);
  await writeFile(staging, contents, { flag: "wx" });
  try {
    await link(staging, destination);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`${destination} already exists. Choose a new --to path.`);
    throw error;
  }
  const { tracks, transitions } = edit.compositions[0];
  console.log(`Created ${destination} · ${tracks.length} tracks · ${tracks.reduce((n, track) => n + track.items.length, 0)} items · ${transitions.length} transitions`);
} finally {
  try { if (staging !== undefined) await rm(staging, { force: true }); }
  finally { await host.close(); }
}
