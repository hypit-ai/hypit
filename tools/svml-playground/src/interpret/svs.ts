import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { MarkupImportRequest } from "@narratage/markup";
import { parseSvs, svsRecipeType } from "@narratage/svs";

import { Scope } from "./scope.js";

/**
 * Blank the Source Header without moving any later character, so every range the
 * SVS parser reports still indexes the file the author sees.
 */
export function maskedSourceHeader(source: string): string {
  return source.replace(/^\s*<\?svml\s+using=(['"])[^'"]+\1\s*\?>/u, (header) =>
    header.replace(/[^\r\n]/gu, " "));
}

/**
 * Bind every Recipe of an imported style sheet under its alias, matching the
 * elaborator's `<alias>.<recipe.path>` naming.
 */
export function loadSourceImports(
  sourceFile: string,
  imports: readonly MarkupImportRequest[],
  scope: Scope,
): readonly string[] {
  const files: string[] = [];
  for (const request of imports) {
    if (request.kind !== "source") continue;
    const file = resolve(dirname(sourceFile), request.from);
    if (!file.endsWith(".svs")) {
      throw new Error(`Preview interprets .svs source imports only; ${request.from} is not one.`);
    }
    files.push(file);
    const sheet = parseSvs(file, maskedSourceHeader(readFileSync(file, "utf8")));
    for (const recipe of sheet.recipes) {
      scope.define(
        `${request.alias}.${recipe.value.path}`,
        svsRecipeType,
        recipe.value,
        request.range,
      );
    }
  }
  return files;
}
