import type { RunFrontend } from "@hypit/run";
import { decodeSourceText } from "@hypit/source";

import { parseRunDocument } from "./syntax.js";

export const runMarkupFrontendId = "@hypit/markup/run@1";

export const runMarkupFrontend: RunFrontend = {
  id: runMarkupFrontendId,
  discover(source) {
    const document = parseRunDocument(source.name, decodeSourceText(source));
    return { author: document.author, imports: document.imports };
  },
  decode(source) {
    return parseRunDocument(source.name, decodeSourceText(source));
  },
};
