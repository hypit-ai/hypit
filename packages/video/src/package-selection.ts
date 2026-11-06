import { discoverSourcePackages } from "@hypit/hypit/cli";
import { AuthorDeclarationRegistry } from "@hypit/hypit/author";
import { createSvmlAuthorFrontend } from "@hypit/hypit/svml";
import { svmlAuthorFrontendId } from "@hypit/hypit/svml";
import type { LoadedPackage } from "@hypit/hypit/loader";

const svmlFrontend = createSvmlAuthorFrontend({ compilers: new AuthorDeclarationRegistry() });

/** Video Distribution bootstrap: the Host selects canonical SVML before package discovery. */
export async function discoverVideoSourcePackages(
  sourcePath: string,
  options: {
    readonly workspaceRoot?: string;
    readonly packageRoot?: string;
    readonly distributionPackageRoot?: string;
    readonly packages?: readonly LoadedPackage[];
  } = {},
) {
  return await discoverSourcePackages(sourcePath, {
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
    ...(options.packageRoot === undefined ? {} : { packageRoot: options.packageRoot }),
    ...(options.distributionPackageRoot === undefined
      ? {}
      : { distributionPackageRoot: options.distributionPackageRoot }),
    ...(options.packages === undefined ? {} : { packages: options.packages }),
    bootstrapAuthorFrontends: [svmlFrontend],
    sourceAdapter: (unit) => ({ unit, frontend: svmlAuthorFrontendId }),
  });
}
