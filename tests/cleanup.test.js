const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

test("retired keys are removed and everything else is kept", async () => {
  const ctx = loadScripts("storage/cleanup.js");
  Object.assign(ctx.store, {
    tabby_tab_activity: { 1: {} },
    tabby_sidebar_prefs: { showEmpty: true },
    tabby_secret_config: { salt: "x" },
    tabby_secret_snapshots: [],
    tabby_snapshots: [{ id: "a" }],
    tabby_folders: [{ id: "f" }],
    openrouterApiKey: "k",
    openrouterModel: "m",
  });

  const removed = await ctx.evaluate("cleanupRetiredKeys()");

  assert.deepEqual(Object.keys(ctx.store).sort(), ["tabby_folders", "tabby_snapshots"]);
  assert.deepEqual(
    [...removed].sort(),
    [
      "openrouterApiKey",
      "openrouterModel",
      "tabby_secret_config",
      "tabby_secret_snapshots",
      "tabby_sidebar_prefs",
      "tabby_tab_activity",
    ]
  );
});

test("a Secret Vault that still holds snapshots is left untouched", async () => {
  const ctx = loadScripts("storage/cleanup.js");
  Object.assign(ctx.store, {
    tabby_secret_config: { salt: "x" },
    tabby_secret_snapshots: [{ id: "s", ciphertext: "c", iv: "i" }],
    tabby_tab_activity: {},
  });

  await ctx.evaluate("cleanupRetiredKeys()");

  assert.deepEqual(Object.keys(ctx.store).sort(), ["tabby_secret_config", "tabby_secret_snapshots"]);
});

test("a Secret Vault config with no snapshot list is removed", async () => {
  const ctx = loadScripts("storage/cleanup.js");
  Object.assign(ctx.store, { tabby_secret_config: { salt: "x" } });

  await ctx.evaluate("cleanupRetiredKeys()");

  assert.deepEqual(Object.keys(ctx.store), []);
});

test("an empty store is fine", async () => {
  const ctx = loadScripts("storage/cleanup.js");
  const removed = await ctx.evaluate("cleanupRetiredKeys()");
  assert.equal(removed.length, 0);
});
