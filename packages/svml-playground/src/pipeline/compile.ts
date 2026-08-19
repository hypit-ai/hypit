/**
 * Compile a Source exactly as a build does.
 *
 * The preview reads nothing itself. Every tag is decoded by the package that
 * declares it, so what the preview shows is what a build would produce, and a
 * Source that will not build does not silently preview.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { compileSourceClosure, resolveCompiledSourceExport } from "@hypit/elaborator";
import type { Digest } from "@hypit/protocol";
import { createRecordAdmitter } from "@hypit/validation";

import { officialVideoDomain } from "../official-video.js";
import { createObserver } from "./observe.js";
import type { Observations } from "./observe.js";

/** Bytes a Source named, kept so the preview can serve the exact file. */
export type ServedFile = { readonly mediaType: string; readonly bytes: Uint8Array };

export type CompiledSource = {
  readonly compiled: CompiledClosure;
  readonly observations: Observations;
  /** Assets the Source pulled in, by digest, ready to serve. */
  readonly served: ReadonlyMap<string, ServedFile>;
  /** Resolve a value the author named, such as `main.composition`. */
  readonly exportRef: (name: string) => string | undefined;
  /** Every export, so the preview can find what it needs by Type. */
  readonly exports: readonly { readonly name: string; readonly type: string; readonly ref: string }[];
};

type CompiledClosure = {
  readonly program: unknown;
  readonly elaboration: { readonly graph: { readonly id: string } };
  readonly exports: readonly {
    readonly name: string;
    readonly type: { readonly name: string };
    readonly ref: { readonly kind: string; readonly id: string };
  }[];
};

/** An error the author can act on, pointed at the tag that caused it. */
export class CompileFailure extends Error {
  readonly range: { readonly start: number; readonly end: number } | undefined;

  constructor(message: string, range?: { readonly start: number; readonly end: number }) {
    super(message);
    this.name = "CompileFailure";
    this.range = range;
  }
}

/** Whether a path sits inside a directory, rather than merely starting with it. */
function within(root: string, path: string): boolean {
  const inside = relative(root, path);
  return inside === "" || (!inside.startsWith("..") && !isAbsolute(inside));
}

function digestOfBytes(bytes: Uint8Array): Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export async function compileSource(entryPath: string): Promise<CompiledSource> {
  const domain = await officialVideoDomain();
  const served = new Map<string, ServedFile>();
  // Everything a Source reads has to sit beside it, as it must in a build.
  const root = dirname(entryPath);
  const resolveModule = (request: { readonly from: string }) => {
    const found = domain.resolveModule(request.from);
    if (found === undefined) {
      throw new CompileFailure(`No package in this preview declares ${request.from}.`);
    }
    return found;
  };
  const observer = createObserver(domain.surfaces, resolveModule);

  let compiled: CompiledClosure;
  try {
    compiled = await compileSourceClosure({
      entry: { id: entryPath, name: "main.svml", text: readFileSync(entryPath, "utf8") },
      closure: domain.closure,
      frontends: domain.frontends(observer.surfaces),
      admitRecord: createRecordAdmitter(domain.validators),
      resolveSource(importer: { readonly id: string }, request: { readonly from: string }) {
        const path = resolve(dirname(importer.id), request.from);
        return { id: path, name: request.from, text: readFileSync(path, "utf8") };
      },
      resolveAsset(importer: { readonly id: string }, request: {
        readonly from: string;
        readonly mediaType: string;
        readonly bytes?: Uint8Array;
      }) {
        // A package Surface hands over its own bytes; an authored asset is a
        // path beside the Source, and a build will only read one that sits
        // inside the Source's own directory. Reading further would let the
        // preview show a Source no build would accept.
        if (request.bytes === undefined) {
          const asset = resolve(dirname(importer.id), request.from);
          if (!within(root, asset)) {
            throw new CompileFailure(
              `Source asset ${asset} is outside ${root}, so a build would refuse to read it.`,
            );
          }
        }
        const bytes = request.bytes ?? readFileSync(resolve(dirname(importer.id), request.from));
        const digest = digestOfBytes(bytes);
        served.set(digest, { mediaType: request.mediaType, bytes });
        return { artifact: { kind: "blob", digest, size: bytes.byteLength, mediaType: request.mediaType } };
      },
    } as never) as unknown as CompiledClosure;
  } catch (error) {
    const held = error as { message?: string; range?: { start: number; end: number } };
    // The tag that failed is the one the Surfaces were last handed.
    const last = observer.observations().placements.at(-1);
    throw new CompileFailure(held.message ?? String(error), held.range ?? last?.range);
  }

  const exports = compiled.exports.map((item) => ({
    name: item.name, type: item.type.name, ref: item.ref.id,
  }));
  return {
    compiled,
    observations: observer.observations(),
    served,
    exports,
    exportRef(name) {
      const found = exports.find((item) => item.name === name);
      return found?.ref;
    },
  };
}

export { resolveCompiledSourceExport };
