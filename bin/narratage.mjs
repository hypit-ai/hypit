#!/usr/bin/env node

import { register } from "tsx/esm/api";

process.env.NARRATAGE_CLI_LAUNCHER ??= import.meta.filename;
register();
await import("../packages/video-cli/src/cli.ts");
