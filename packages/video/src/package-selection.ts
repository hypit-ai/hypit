import { discoverSourcePackages } from "@hypit/hypit/cli";
import {
  createMarkupDeclarationAuthorFrontend,
  MarkupDeclarationRegistry,
} from "@hypit/hypit/markup";
import { AuthorDeclarationRegistry } from "@hypit/hypit/author";
import type { LoadedPackage } from "@hypit/hypit/loader";

const markupFrontend = createMarkupDeclarationAuthorFrontend({
  syntax: new MarkupDeclarationRegistry(),
  compilers: new AuthorDeclarationRegistry(),
  resolveModule(request) {
    throw new Error(`Markup discovery unexpectedly resolved Module ${request.from}`);
  },
});

/** Video Distribution bootstrap: generic Source discovery plus the bare Markup Frontend. */
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
    bootstrapAuthorFrontends: [markupFrontend],
  });
}
