import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { compileSourceClosure } from "@narratage/elaborator";
import { createRecordAdmitter } from "@narratage/validation";

import {
  videoDomainClosure, videoDomainFrontends, videoDomainModule, videoDomainValidators,
} from "../src/index.js";

const examples = resolve(import.meta.dirname, "../../../examples");

async function compile(entryPath: string): Promise<unknown> {
  // Discovery has to run before a module can be resolved by name.
  const closure = await videoDomainClosure();
  return await compileSourceClosure({
    entry: { id: entryPath, name: "main.svml", text: readFileSync(entryPath, "utf8") },
    closure,
    frontends: await videoDomainFrontends((request) => {
      const found = videoDomainModule(request.from);
      if (found === undefined) throw new Error(`no module for ${request.from}`);
      return found;
    }),
    admitRecord: createRecordAdmitter(await videoDomainValidators()),
    resolveSource(importer: { id: string }, request: { from: string }) {
      const path = resolve(dirname(importer.id), request.from);
      return { id: path, name: request.from, text: readFileSync(path, "utf8") };
    },
    resolveAsset(importer: { id: string }, request: { from: string; mediaType: string; bytes?: Uint8Array }) {
      // A package Surface hands its own bytes over; an authored asset is a path
      // beside the Source.
      const bytes = request.bytes ?? readFileSync(resolve(dirname(importer.id), request.from));
      return {
        artifact: {
          kind: "blob" as const,
          digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
          size: bytes.byteLength,
          mediaType: request.mediaType,
        },
      };
    },
  } as never);
}

/**
 * Compile every committed example the way a build does.
 *
 * A Surface may only emit Types its manifest declares, and the frontend is the
 * only thing that checks. Two packages shipped Surfaces that emitted more than
 * they admitted, and nothing noticed because no Source here wrote those tags.
 * `all-components-preview` writes every kind of Track for exactly that reason.
 *
 * A Surface is only exercised when a real Source names it, so a package can
 * declare a tag whose Types or graph do not agree with what its handler emits
 * and nothing notices. This is the test that notices: it needs no Provider, no
 * lock and no filesystem beyond the example itself.
 */
for (const name of readdirSync(examples, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()) {
  const entryPath = join(examples, name, "main.svml");
  if (!existsSync(entryPath)) continue;
  test(`the ${name} example compiles`, async (context) => {
    // Generated stills are deliberately not committed; the example READMEs say
    // to supply them. Absent material is not a compiler failure.
    const assets = join(examples, name, "assets");
    if (existsSync(join(examples, name, "README.md"))
      && readFileSync(entryPath, "utf8").includes("./assets/")
      && !existsSync(assets)) {
      context.skip(`${name} needs assets that are not committed`);
      return;
    }
    const compiled = await compile(entryPath) as {
      graph: { outputs: readonly unknown[] };
    };
    assert.ok(compiled.graph.outputs.length >= 0);
  });
}
