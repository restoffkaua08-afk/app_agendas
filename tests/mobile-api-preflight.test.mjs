import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMobileApiUrl, verifyMobileApi } from "../scripts/verify-mobile-api.mjs";

test("accepts only an HTTPS API root", () => {
  assert.equal(normalizeMobileApiUrl("https://api.example.com/"), "https://api.example.com");
  assert.throws(() => normalizeMobileApiUrl("http://api.example.com"), /HTTPS/);
  assert.throws(() => normalizeMobileApiUrl("https://api.example.com/v1"), /raiz/);
});

test("requires API health, database configuration, and Android CORS", async () => {
  const fetcher = async (url, options) => url.endsWith("/health")
    ? Response.json({ service: "agenda-api", persistence: "configured" })
    : new Response(null, { status: 204, headers: {
      "access-control-allow-origin": options.headers.Origin,
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-allow-methods": "GET, POST, OPTIONS"
    } });
  assert.equal(await verifyMobileApi("https://api.example.com", fetcher), "https://api.example.com");
  await assert.rejects(verifyMobileApi("https://api.example.com", async (url) => url.endsWith("/health")
    ? Response.json({ service: "agenda-api", persistence: "configured" })
    : new Response(null, { status: 204 })), /ALLOWED_ORIGINS/);
});
