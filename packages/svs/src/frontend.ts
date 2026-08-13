import {
  sealRecord,
  sealTypedModule,
  verifyClosure,
  verifyRecordStructure,
} from "@narratage/core";
import { sealAuthorModule } from "@narratage/elaborator";
import type { AuthorFrontend, AuthorSourceExport } from "@narratage/elaborator";

import {
  svsFrontendId,
  svsFrontendImplementationDigest,
  svsModuleRef,
  svsRecipeType,
} from "./manifest.js";
import { parseSvs } from "./parser.js";

export const svsFrontend: AuthorFrontend = {
  id: svsFrontendId,
  implementationDigest: svsFrontendImplementationDigest,
  discover() {
    return { modules: [`${svsModuleRef.name}@${svsModuleRef.version}`], sources: [] };
  },
  decode(source, context) {
    verifyClosure(context.closure);
    const parsed = parseSvs(source.name, source.text);
    const records = parsed.recipes.map((recipe) => sealRecord({
      id: recipe.value.path,
      type: svsRecipeType,
      value: { kind: "inline", value: recipe.value },
      origin: { kind: "authored" },
    }));
    records.forEach((record) => verifyRecordStructure(context.closure, record));
    const exports: AuthorSourceExport[] = records.map((record) => ({
      name: record.id,
      ref: { kind: "record", id: record.id },
      type: record.type,
    }));
    return {
      module: sealTypedModule({
        records,
      }),
      author: sealAuthorModule({ components: [] }),
      fragments: [],
      exports,
    };
  },
};
