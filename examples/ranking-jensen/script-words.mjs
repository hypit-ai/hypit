import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseScript } from "@hypit/script";

const [take, ...extra] = process.argv.slice(2);
if (!take || extra.length > 0) throw new Error("Select one take, for example: node script-words.mjs kimberly.");
const source = new URL("./documents/jensen.script", import.meta.url);
const script = parseScript(fileURLToPath(source), await readFile(source, "utf8"));
const selected = script.segments.get(take);
if (!selected) throw new Error(`Jensen script has no take ${take}.`);
process.stdout.write(JSON.stringify(selected.spokenWords, null, 2) + "\n");
