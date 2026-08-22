#!/usr/bin/env node

import { register } from "tsx/esm/api";

// Keep author-relative paths anchored to the caller even though Studio itself
// is executed from the replaceable Hypit Distribution checkout.
process.env.INIT_CWD ??= process.cwd();
register();
await import("../packages/studio/start.ts");
