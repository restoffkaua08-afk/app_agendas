import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(appRoot, "www");
const capacitorRuntime = fileURLToPath(import.meta.resolve("@capacitor/core"));
const apiBaseUrl = (process.env.MOBILE_API_URL ?? "").replace(/\/+$/, "");

await mkdir(resolve(webRoot, "vendor"), { recursive: true });
await copyFile(capacitorRuntime, resolve(webRoot, "vendor/capacitor-core.js"));
await writeFile(resolve(webRoot, "config.js"), `window.AGENDA_CONFIG=${JSON.stringify({ apiBaseUrl })};\n`, "utf8");
