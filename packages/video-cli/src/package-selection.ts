import { discoverSourcePackages } from "@narratage/cli";
import {
  createMarkupAuthorFrontend,
  MarkupSurfaceRegistry,
} from "@narratage/markup";
import type { NodePackageBinding } from "@narratage/package-loader-node";

const markupFrontend = createMarkupAuthorFrontend({
  registry: new MarkupSurfaceRegistry(),
  resolveModule(request) {
    throw new Error(`Markup discovery unexpectedly resolved Module ${request.from}`);
  },
});

/** Video Distribution bootstrap: generic Source discovery plus the bare Markup Frontend. */
export async function discoverVideoSourcePackages(
  sourcePath: string,
  options: {
    readonly workspaceRoot?: string;
    readonly packages?: readonly NodePackageBinding[];
  } = {},
) {
  return await discoverSourcePackages(sourcePath, {
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
    ...(options.packages === undefined ? {} : { packages: options.packages }),
    bootstrapAuthorFrontends: [markupFrontend],
  });
}
