import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(appRoot, "www");
const capacitorPackagePath = fileURLToPath(import.meta.resolve("@capacitor/core/package.json"));
const capacitorPackage = JSON.parse(await readFile(capacitorPackagePath, "utf8"));
const capacitorRuntime = resolve(dirname(capacitorPackagePath), capacitorPackage.module);
const apiBaseUrl = (process.env.MOBILE_API_URL ?? "").replace(/\/+$/, "");

await mkdir(resolve(webRoot, "vendor"), { recursive: true });
await copyFile(capacitorRuntime, resolve(webRoot, "vendor/capacitor-core.js"));
await writeFile(resolve(webRoot, "config.js"), `window.AGENDA_CONFIG=${JSON.stringify({ apiBaseUrl })};\n`, "utf8");
