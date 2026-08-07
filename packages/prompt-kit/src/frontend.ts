import {
  sealRecord,
  sealTypedModule,
  verifyClosure,
  verifyRecordStructure,
} from "@narratage/core";
import { sealAuthorModule } from "@narratage/elaborator";
import type { AuthorFrontend, AuthorSourceExport } from "@narratage/elaborator";
import { parseSvs } from "@narratage/svs";

import {
  promptKitImplementationDigests,
  promptKitModuleRef,
  promptKitTypes,
} from "./manifest.js";
import { promptKitSpecFromSvsRecipes } from "./svs.js";

export const promptKitSvsFrontendId = "@narratage/prompt-kit/svs@1";

/**
 * A self-described Prompt Kit source is ordinary SVS syntax with Prompt Kit semantics.
 * It compiles one complete Kit into one authored PromptKitSpec and never enters the Run Graph.
 */
export const promptKitSvsFrontend: AuthorFrontend = {
  id: promptKitSvsFrontendId,
  implementationDigest: promptKitImplementationDigests.svsFrontend,
  discover() {
    return {
      modules: [`${promptKitModuleRef.name}@${promptKitModuleRef.version}`],
      sources: [],
    };
  },
  decode(source, context) {
    verifyClosure(context.closure);
    const parsed = parseSvs(source.name, source.text);
    const recipes = parsed.recipes.map((item) => item.value);
    const candidates = recipes
      .map((recipe) => /^prompt-kit\.([a-z][a-z0-9-]{0,95})$/u.exec(recipe.path)?.[1])
      .filter((id): id is string => id !== undefined);
    if (candidates.length !== 1) {
      throw new Error(`${source.name} must declare exactly one prompt-kit.<id> metadata Recipe`);
    }
    const spec = promptKitSpecFromSvsRecipes(recipes, candidates[0]!);
    const record = sealRecord({
      id: spec.id,
      type: promptKitTypes.spec,
      value: { kind: "inline", value: spec as unknown as import("@narratage/protocol").CanonicalValue },
      conformance: "exact",
      origin: {
        kind: "authored",
        sourceDigest: source.sourceDigest,
        frontendClosureDigest: promptKitImplementationDigests.svsFrontend,
        sourceName: source.name,
      },
    });
    verifyRecordStructure(context.closure, record);
    const exports: AuthorSourceExport[] = [{
      name: spec.id,
      ref: { kind: "record", id: record.id },
      type: record.type,
    }];
    return {
      module: sealTypedModule({
        id: `source:${source.name}`,
        closureDigest: context.closure.digest,
        records: [record],
      }),
      author: sealAuthorModule({ name: `source:${source.name}`, components: [] }),
      fragments: [],
      exports,
    };
  },
};
