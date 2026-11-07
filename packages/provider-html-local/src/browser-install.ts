import { installHtmlBrowser } from "@hypit/html-chromium-local";

const [cacheDir, version, baseUrl] = process.argv.slice(2);
if (process.argv.length < 4 || process.argv.length > 5 || !cacheDir || !version) throw new Error("Expected the HTML browser cache directory, exact version and optional archive base URL");
await installHtmlBrowser(cacheDir, version, baseUrl);
