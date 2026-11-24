const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

const load = () =>
  loadScripts("lib/urls.js", "lib/domains.js", "storage/dedup.js", "storage/snapshots.js", "storage/folders.js");

test("deleteFolder reports what it removed, so the deletion can be undone", async () => {
  const ctx = load();
  ctx.store.tabby_folders = [{ id: "f1", name: "Work", createdAt: 1 }, { id: "f2", name: "Home", createdAt: 2 }];
  ctx.store.tabby_snapshots = [
    { id: "a", folderId: "f1", tabs: [] },
    { id: "b", folderId: "f2", tabs: [] },
    { id: "c", folderId: "f1", tabs: [] },
  ];

  const removed = await ctx.evaluate('deleteFolder("f1")');

  assert.equal(removed.folder.name, "Work");
  assert.deepEqual([...removed.snapshotIds].sort(), ["a", "c"]);
  assert.deepEqual(ctx.store.tabby_folders.map((f) => f.id), ["f2"]);
  assert.equal(ctx.store.tabby_snapshots[0].folderId, null);
});

test("deleteFolder returns null for an unknown folder", async () => {
  const ctx = load();
  assert.equal(await ctx.evaluate('deleteFolder("nope")'), null);
});

test("restoreFolder brings the folder back with its snapshots", async () => {
  const ctx = load();
  ctx.store.tabby_folders = [{ id: "f1", name: "Work", createdAt: 1 }];
  ctx.store.tabby_snapshots = [
    { id: "a", folderId: "f1", tabs: [] },
    { id: "b", folderId: null, tabs: [] },
  ];

  const removed = await ctx.evaluate('deleteFolder("f1")');
  await ctx.evaluate(`restoreFolder(${JSON.stringify(removed)})`);

  assert.deepEqual(ctx.store.tabby_folders, [{ id: "f1", name: "Work", createdAt: 1 }]);
  assert.equal(ctx.store.tabby_snapshots.find((s) => s.id === "a").folderId, "f1");
  assert.equal(ctx.store.tabby_snapshots.find((s) => s.id === "b").folderId, null);
});

test("restoreFolder leaves a snapshot alone if it was filed elsewhere meanwhile", async () => {
  const ctx = load();
  ctx.store.tabby_folders = [{ id: "f1", name: "Work", createdAt: 1 }, { id: "f2", name: "Home", createdAt: 2 }];
  ctx.store.tabby_snapshots = [{ id: "a", folderId: "f1", tabs: [] }];

  const removed = await ctx.evaluate('deleteFolder("f1")');
  ctx.store.tabby_snapshots[0].folderId = "f2";
  await ctx.evaluate(`restoreFolder(${JSON.stringify(removed)})`);

  assert.equal(ctx.store.tabby_snapshots[0].folderId, "f2");
  assert.equal(ctx.store.tabby_folders.length, 2);
});
