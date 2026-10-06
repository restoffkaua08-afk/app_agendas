import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function normalizeMobileApiUrl(value) {
  if (!value?.trim()) throw new Error("Defina MOBILE_API_URL com o endereço HTTPS da API antes de gerar o APK.");
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error("MOBILE_API_URL não é uma URL válida."); }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("MOBILE_API_URL deve ser a URL HTTPS raiz da API, sem usuário, senha, rota ou parâmetros.");
  }
  return url.origin;
}

export async function verifyMobileApi(value, fetcher = fetch) {
  const base = normalizeMobileApiUrl(value);
  let healthResponse;
  try { healthResponse = await fetcher(`${base}/health`, { signal: AbortSignal.timeout(10000) }); }
  catch { throw new Error("A API não respondeu em /health. Confira a publicação e MOBILE_API_URL."); }
  const health = await healthResponse.json().catch(() => ({}));
  if (!healthResponse.ok || health.service !== "agenda-api" || health.persistence !== "configured") {
    throw new Error("A API não está pronta: /health precisa confirmar agenda-api e banco configurado.");
  }

  let preflight;
  try {
    preflight = await fetcher(`${base}/v1/mobile/pair`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://localhost",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type"
      },
      signal: AbortSignal.timeout(10000)
    });
  } catch { throw new Error("Não foi possível validar o acesso do Android à API."); }
  const origin = preflight.headers.get("access-control-allow-origin");
  const headers = (preflight.headers.get("access-control-allow-headers") ?? "").toLowerCase().split(",").map((item) => item.trim());
  const methods = (preflight.headers.get("access-control-allow-methods") ?? "").toUpperCase().split(",").map((item) => item.trim());
  if (!preflight.ok || origin !== "https://localhost" || !headers.includes("authorization") || !headers.includes("content-type") || !methods.includes("POST")) {
    throw new Error("A API não libera o pareamento do Android. Inclua https://localhost em ALLOWED_ORIGINS e permita POST, Authorization e Content-Type.");
  }
  return base;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const base = await verifyMobileApi(process.env.MOBILE_API_URL);
    console.log(`API e acesso Android validados: ${base}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
