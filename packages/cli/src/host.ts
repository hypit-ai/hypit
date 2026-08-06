import {
  ModulePackageRegistry,
  NodeCompiler,
  NodeCompilerError,
} from "@svml/compiler-node";
import { videoContractManifests } from "@svml/contracts";
import { AuthorFrontendRegistry } from "@svml/elaborator";
import {
  decodeFilmSurface,
  filmManifest,
  filmModuleRef,
  filmSurfaceImplementationDigest,
} from "@svml/film";
import { hyperframesManifest } from "@svml/hyperframes";
import {
  decodeHyperframesRenderSurface,
  hyperframesRenderManifest,
  hyperframesRenderModuleRef,
  hyperframesRenderSurfaceImplementationDigest,
} from "@svml/hyperframes-render";
import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptSurfaceImplementationDigest,
} from "@svml/script";
import { mediaPipelineManifest } from "@svml/media-pipeline";
import { svsFrontend, svsManifest } from "@svml/svs";
import {
  createTextAuthorFrontend,
  TextSurfaceRegistry,
  textAuthorFrontendId,
} from "@svml/text";

export type OfficialCompilerOptions = {
  readonly root?: string;
};

/** The trusted official prelude used by the CLI. Core and Compiler Node know none of these packages. */
export function createOfficialNodeCompiler(options: OfficialCompilerOptions = {}): NodeCompiler {
  const modules = new ModulePackageRegistry();
  for (const manifest of videoContractManifests) modules.register({ manifest });
  modules.register({
    manifest: scriptManifest,
    specifiers: ["@svml/script", "@svml/script@1"],
  });
  modules.register({ manifest: svsManifest });
  modules.register({ manifest: hyperframesManifest });
  modules.register({ manifest: mediaPipelineManifest });
  modules.register({
    manifest: filmManifest,
    specifiers: ["@svml/film", "@svml/film@1"],
  });
  modules.register({
    manifest: hyperframesRenderManifest,
    specifiers: ["@svml/hyperframes-render", "@svml/hyperframes-render@1"],
  });

  const surfaces = new TextSurfaceRegistry();
  surfaces.registerRaw(
    scriptModuleRef,
    "script",
    scriptSurfaceImplementationDigest,
    decodeScriptSurface,
  );
  surfaces.registerStructured(
    filmModuleRef,
    "film",
    filmSurfaceImplementationDigest,
    decodeFilmSurface,
  );
  surfaces.registerStructured(
    hyperframesRenderModuleRef,
    "video",
    hyperframesRenderSurfaceImplementationDigest,
    decodeHyperframesRenderSurface,
  );

  const frontends = new AuthorFrontendRegistry();
  frontends.register(createTextAuthorFrontend({
    registry: surfaces,
    resolveModule(request) {
      const resolved = modules.resolve(request.from);
      if (resolved === undefined) {
        throw new NodeCompilerError(
          "UNKNOWN_MODULE_IMPORT",
          `No trusted CLI package satisfies ${request.from}`,
          request.from,
        );
      }
      return resolved;
    },
  }));
  frontends.register(svsFrontend);

  return new NodeCompiler({
    modules,
    frontends,
    entryFrontend: textAuthorFrontendId,
    ...(options.root === undefined ? {} : { root: options.root }),
  });
}
