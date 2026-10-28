import type { InvocationFrontend } from "@hypit/invocation";
import { decodeSourceText } from "@hypit/source";

import { parseInvocationSourceDocument } from "./syntax.js";

export const invocationMarkupFrontendId = "@hypit/markup/invocation@1";

export const invocationMarkupFrontend: InvocationFrontend = {
  id: invocationMarkupFrontendId,
  discover(source) {
    const document = parseInvocationSourceDocument(source.name, decodeSourceText(source));
    return { author: document.author };
  },
  decode(source) {
    return parseInvocationSourceDocument(source.name, decodeSourceText(source));
  },
};
