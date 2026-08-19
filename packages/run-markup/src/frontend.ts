import type { RunFrontend } from "@hypit/run";

import { parseRunDocument } from "./syntax.js";

export const runMarkupFrontendId = "@hypit/run-markup@1";

export const runMarkupFrontend: RunFrontend = {
  id: runMarkupFrontendId,
  discover(source) {
    const document = parseRunDocument(source.name, source.text);
    return { author: document.author, imports: document.imports };
  },
  decode(source) {
    return { document: parseRunDocument(source.name, source.text) };
  },
};
