import { writeFile } from "node:fs/promises";

import { renderElementReference } from "./support/elements.js";

const packagesRoot = new URL("../packages/", import.meta.url);
const target = new URL("../docs/guide/elements.md", import.meta.url);

await writeFile(target, await renderElementReference(packagesRoot), "utf8");
process.stdout.write(`Element Reference written to ${target.pathname.split("/").slice(-3).join("/")}\n`);
