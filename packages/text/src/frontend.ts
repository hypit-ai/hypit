import {
  sealRecord,
  sealTypedModule,
  verifyClosure,
  verifyRecordStructure,
} from "@narratage/core";
import { sealAuthorModule } from "@narratage/elaborator";
import type { AuthorFrontend, AuthorSourceExport } from "@narratage/elaborator";
import { parseSvs } from "@narratage/svs";

import { textImplementationDigests, textModuleRef, textTypes } from "./manifest.js";
import { textTemplateFromSvsRecipes } from "./svs.js";

export const textSvsFrontendId = "@narratage/text/svs@1";

export const textSvsFrontend: AuthorFrontend = {
  id: textSvsFrontendId,
  implementationDigest: textImplementationDigests.svsFrontend,
  discover() {
    return { modules: [`${textModuleRef.name}@${textModuleRef.version}`], sources: [] };
  },
  decode(source, context) {
    verifyClosure(context.closure);
    const parsed = parseSvs(source.name, source.text);
    const recipes = parsed.recipes.map((item) => item.value);
    const candidates = recipes
      .map((recipe) => /^text-template\.([a-z][a-z0-9-]{0,95})$/u.exec(recipe.path)?.[1])
      .filter((id): id is string => id !== undefined);
    if (candidates.length !== 1) throw new Error(`${source.name} must declare exactly one root Recipe text-template.<id>`);
    const id = candidates[0]!;
    const template = textTemplateFromSvsRecipes(recipes, id);
    const record = sealRecord({
      id,
      type: textTypes.template,
      value: { kind: "inline", value: template as unknown as import("@narratage/protocol").CanonicalValue },
      origin: { kind: "authored" },
    });
    verifyRecordStructure(context.closure, record);
    const exports: AuthorSourceExport[] = [{ name: id, ref: { kind: "record", id }, type: textTypes.template }];
    return {
      module: sealTypedModule({ records: [record] }),
      author: sealAuthorModule({ components: [] }),
      fragments: [],
      exports,
    };
  },
};
