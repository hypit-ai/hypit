import { digestOf } from "@narratage/protocol";
import type { RunFrontend } from "@narratage/run";

import { parseRunDocument } from "./syntax.js";

export const runTextFrontendId = "@narratage/run-text@1";
export const runTextFrontendImplementationDigest = digestOf("@narratage/run-text/frontend@1");

export const runTextFrontend: RunFrontend = {
  id: runTextFrontendId,
  implementationDigest: runTextFrontendImplementationDigest,
  discover(source) {
    const document = parseRunDocument(source.name, source.text);
    return { author: document.author, imports: document.imports };
  },
  decode(source) {
    return { document: parseRunDocument(source.name, source.text) };
  },
};
