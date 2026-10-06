import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

async function checkPublicScreen(checks = "") {
  const buildSource = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  const runtimeSpecifier = buildSource.match(/const capacitorRuntime = fileURLToPath\(import\.meta\.resolve\("([^"]+)"\)\);/)?.[1];
  assert.ok(runtimeSpecifier, "The runtime copied for publication must be identifiable");

  const result = spawnSync(process.execPath, ["--experimental-vm-modules", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { readFile } from "node:fs/promises";
    import { createContext, SourceTextModule } from "node:vm";

    const handlers = {};
    const root = { innerHTML: "", addEventListener(type, handler) { handlers[type] = handler; } };
    let networkCalls = 0;
    let storageWrites = 0;
    const context = createContext({
      window: { AGENDA_CONFIG: { apiBaseUrl: "https://api.example.com" } },
      document: {
        querySelector: () => root,
        documentElement: { dataset: {} }
      },
      localStorage: { getItem: () => null, setItem() { storageWrites += 1; } },
      fetch() { networkCalls += 1; throw new Error("Unexpected network request"); },
      setTimeout() {}
    });
    const runtime = new SourceTextModule(
      await readFile(new URL(import.meta.resolve(${JSON.stringify(runtimeSpecifier)})), "utf8"),
      { context }
    );
    const appSource = await readFile("www/app.js", "utf8");
    const app = new SourceTextModule(appSource + "\\nexport const inspect = (expression) => eval(expression);", { context });
    await app.link((specifier) => {
      assert.equal(specifier, "./vendor/capacitor-core.js");
      return runtime;
    });
    await app.evaluate();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof runtime.namespace.registerPlugin, "function");
    assert.match(root.innerHTML, /Seu negócio, em suas mãos/);
    assert.match(root.innerHTML, /id="connect-form"/);
    assert.equal(context.document.documentElement.dataset.theme, "dark");
    const read = app.namespace.inspect;
    const click = async (dataset) => {
      const button = { dataset, classList: { contains: () => false } };
      await handlers.click({ target: { closest: () => button } });
    };
    ${checks}
  `], { cwd: new URL("../", import.meta.url), encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
}

test("the published Capacitor runtime loads the public connection screen as a browser module", async () => {
  await checkPublicScreen();
});

test("demo mode unlocks all tabs and simulates actions without network or persistent storage", async () => {
  await checkPublicScreen(`
    assert.match(root.innerHTML, /Experimentar demonstração grátis/);
    await click({ action: "start-demo" });
    assert.match(root.innerHTML, /Demonstração · Dados fictícios/);
    assert.match(root.innerHTML, /Olá, visitante/);
    assert.equal(read("state.session.token"), undefined);
    assert.equal(read("dayItems().length"), 3);
    assert.equal(read("state.services.length"), 4);

    for (const tab of ["agenda", "reservations", "calendar", "site", "home"]) {
      await click({ tab });
      assert.match(root.innerHTML, /Demonstração · Dados fictícios/);
      assert.equal(read("state.tab"), tab);
    }

    const appointmentId = read("dayItems().find(item => item.status === 'pending').id");
    await click({ action: "status", id: appointmentId, status: "confirmed" });
    assert.equal(read("dayItems()[0].status"), "confirmed");
    assert.match(root.innerHTML, /Nenhuma mensagem foi enviada/);
    await click({ action: "refresh" });
    assert.equal(read("dayItems()[0].status"), "confirmed");
    await click({ action: "status", id: appointmentId, status: "cancelled" });
    assert.equal(read("dayItems()[0].status"), "cancelled");
    const confirmedId = read("dayItems().find(item => item.status === 'confirmed').id");
    await click({ action: "status", id: confirmedId, status: "completed" });
    assert.equal(read("dayItems().find(item => item.id === " + JSON.stringify(confirmedId) + ").status"), "completed");

    await click({ tab: "reservations" });
    await click({ filter: "pending" });
    assert.equal(read("state.filter"), "pending");
    await click({ tab: "site" });
    await click({ action: "service", id: "demo-cut" });
    assert.equal(read("state.services[0].active"), false);
    await click({ action: "refresh" });
    assert.equal(read("state.services[0].active"), false);
    await click({ action: "service", id: "demo-cut" });
    assert.equal(read("state.services[0].active"), true);
    await click({ action: "new-code" });
    assert.match(root.innerHTML, /Este código é fictício/);
    await click({ action: "close-modal" });

    const originalMonth = read("monthKey(state.date)");
    const originalDate = read("dateKey(state.date)");
    await click({ action: "month", step: "1" });
    assert.notEqual(read("monthKey(state.date)"), originalMonth);
    assert.equal(read("dayItems().length"), 3);
    await click({ date: originalDate });
    assert.equal(read("monthKey(state.date)"), originalMonth);
    assert.equal(read("dayItems()[0].status"), "cancelled");
    await assert.rejects(read("request('/v1/mobile/pair')"), /não realiza operações reais/);
    assert.equal(networkCalls, 0);
    assert.equal(storageWrites, 0);

    await click({ action: "exit-demo" });
    assert.match(root.innerHTML, /id="connect-form"/);
    assert.equal(read("state.session"), null);
    assert.equal(read("state.demo"), null);
    assert.equal(read("state.monthItems.length"), 0);
    assert.equal(read("state.services.length"), 0);
    assert.equal(read("state.modal"), "");
    await click({ action: "start-demo" });
    assert.equal(read("dayItems()[0].status"), "pending");
    assert.equal(read("state.services[0].active"), true);
    await click({ tab: "site" });
    assert.match(root.innerHTML, /Sair da demonstração/);
    await click({ action: "exit-demo" });
    assert.equal(networkCalls, 0);
    assert.equal(storageWrites, 0);
  `);
});
