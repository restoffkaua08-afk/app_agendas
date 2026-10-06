import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("the published Capacitor runtime loads the public connection screen as a browser module", async () => {
  const buildSource = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  const runtimeSpecifier = buildSource.match(/const capacitorRuntime = fileURLToPath\(import\.meta\.resolve\("([^"]+)"\)\);/)?.[1];
  assert.ok(runtimeSpecifier, "The runtime copied for publication must be identifiable");

  const result = spawnSync(process.execPath, ["--experimental-vm-modules", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { readFile } from "node:fs/promises";
    import { createContext, SourceTextModule } from "node:vm";

    const root = { innerHTML: "", addEventListener() {} };
    const context = createContext({
      window: {},
      document: {
        querySelector: () => root,
        documentElement: { dataset: {} }
      },
      localStorage: { getItem: () => null }
    });
    const runtime = new SourceTextModule(
      await readFile(new URL(import.meta.resolve(${JSON.stringify(runtimeSpecifier)})), "utf8"),
      { context }
    );
    const app = new SourceTextModule(await readFile("www/app.js", "utf8"), { context });
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
  `], { cwd: new URL("../", import.meta.url), encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
});
