import type { NodeCompiler } from "@svml/compiler-node";
import {
  createActivatedNodeCompiler,
} from "@svml/package-loader-node";
import type { NodeAuthorPackage } from "@svml/package-loader-node";
import { svmlAuthorPackage as videoPrelude } from "@svml/prelude-video";

export type OfficialCompilerOptions = {
  readonly root?: string;
  /** Replaces the ordinary official prelude with an exact trusted package activation set. */
  readonly packages?: readonly NodeAuthorPackage[];
};

/** The CLI names only an ordinary replaceable prelude; no domain package is registered here. */
export function createOfficialNodeCompiler(options: OfficialCompilerOptions = {}): NodeCompiler {
  return createActivatedNodeCompiler(options.packages ?? [videoPrelude], {
    ...(options.root === undefined ? {} : { root: options.root }),
  });
}
