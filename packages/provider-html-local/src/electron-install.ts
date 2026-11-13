import { installHtmlElectron } from "./electron.js";

const [cacheDir, baseUrl] = process.argv.slice(2);
if (process.argv.length < 3 || process.argv.length > 4 || !cacheDir) throw new Error("Expected the Electron cache directory and optional archive base URL");
await installHtmlElectron(cacheDir, baseUrl);
