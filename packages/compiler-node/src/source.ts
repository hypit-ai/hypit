import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type {
  AuthorSourceImport,
  AuthorSourceResolver,
  AuthorSourceUnit,
} from "@svml/elaborator";

import { NodeCompilerError } from "./error.js";

function isWithin(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

/** One-build, read-once filesystem authority for SourceUnits. */
export class NodeSourceHost {
  readonly root: string;
  readonly #cache = new Map<string, AuthorSourceUnit>();
  readonly #edges = new Map<string, AuthorSourceUnit>();

  private constructor(root: string) {
    this.root = root;
  }

  static async create(root: string): Promise<NodeSourceHost> {
    return new NodeSourceHost(await realpath(resolve(root)));
  }

  async load(path: string): Promise<AuthorSourceUnit> {
    const canonical = await realpath(resolve(path));
    if (!isWithin(this.root, canonical)) {
      throw new NodeCompilerError(
        "SOURCE_OUTSIDE_ROOT",
        `Source ${canonical} is outside compiler root ${this.root}`,
        canonical,
      );
    }
    const cached = this.#cache.get(canonical);
    if (cached !== undefined) return cached;
    const unit: AuthorSourceUnit = {
      id: canonical,
      name: relative(this.root, canonical) || canonical.split("/").at(-1) || canonical,
      text: await readFile(canonical, "utf8"),
    };
    this.#cache.set(canonical, unit);
    return unit;
  }

  readonly resolveSource: AuthorSourceResolver = async (
    importer: AuthorSourceUnit,
    request: AuthorSourceImport,
  ): Promise<AuthorSourceUnit> => {
    if (!request.from.startsWith("./") && !request.from.startsWith("../")) {
      throw new NodeCompilerError(
        "UNSUPPORTED_SOURCE_IMPORT",
        `Source import ${request.from} must be relative; package imports are module imports`,
        request.from,
      );
    }
    if (!isWithin(this.root, importer.id)) {
      throw new NodeCompilerError("UNKNOWN_SOURCE_IMPORTER", `${importer.id} is outside this Source Host`, importer.id);
    }
    const edge = `${importer.id}\u0000${request.from}`;
    const locked = this.#edges.get(edge);
    if (locked !== undefined) return locked;
    const loaded = await this.load(resolve(dirname(importer.id), request.from));
    this.#edges.set(edge, loaded);
    return loaded;
  };
}
