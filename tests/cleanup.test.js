const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

test("retired keys are removed and everything else is kept", async () => {
  const ctx = loadScripts("storage/cleanup.js");
  Object.assign(ctx.store, {
    tabby_tab_activity: { 1: {} },
    tabby_sidebar_prefs: { showEmpty: true },
    tabby_snapshots: [{ id: "a" }],
    tabby_folders: [{ id: "f" }],
    tabby_trash: [{ id: "t" }],
    openrouterApiKey: "k",
    openrouterModel: "m",
  });

  const removed = await ctx.evaluate("cleanupRetiredKeys()");

  assert.deepEqual(Object.keys(ctx.store).sort(), ["tabby_folders", "tabby_snapshots", "tabby_trash"]);
  assert.deepEqual(
    [...removed].sort(),
    ["openrouterApiKey", "openrouterModel", "tabby_sidebar_prefs", "tabby_tab_activity"]
  );
});

test("an empty store is fine", async () => {
  const ctx = loadScripts("storage/cleanup.js");
  const removed = await ctx.evaluate("cleanupRetiredKeys()");
  assert.equal(removed.length, 0);
});
