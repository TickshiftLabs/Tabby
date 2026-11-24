const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

const load = () =>
  loadScripts("lib/urls.js", "lib/domains.js", "storage/dedup.js", "storage/snapshots.js", "storage/trash.js");

const A = { url: "https://a.test/", title: "A" };
const B = { url: "https://b.test/", title: "B" };
const urls = (snapshot) => snapshot.tabs.map((t) => t.url);
const byId = (ctx, id) => ctx.store.tabby_snapshots.find((s) => s.id === id);

test("saving works when a stored snapshot has no tabs array", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [{ id: "old", createdAt: 1 }];

  const saved = await ctx.evaluate(`saveSnapshot([${JSON.stringify(A)}], "test")`);

  assert.equal(saved.tabs.length, 1);
  assert.equal(ctx.store.tabby_snapshots.length, 2);
});

test("moving a tab can be undone", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [
    { id: "src", createdAt: 1, tabs: [A, B] },
    { id: "dst", createdAt: 2, tabs: [] },
  ];

  const result = await ctx.evaluate(`moveTabBetweenSnapshots("src", 0, "dst", "${A.url}")`);
  assert.deepEqual(urls(byId(ctx, "src")), [B.url]);
  assert.deepEqual(urls(byId(ctx, "dst")), [A.url]);

  await ctx.evaluate(`undoMoveTab(${JSON.stringify(result.undo)})`);
  assert.deepEqual(urls(byId(ctx, "src")), [A.url, B.url]);
  assert.deepEqual(urls(byId(ctx, "dst")), []);
});

test("moving a snapshot's last tab sends the snapshot to Trash, not to nowhere", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [
    { id: "src", customName: "Lisbon", starred: true, folderId: "f", createdAt: 1, tabs: [A] },
    { id: "dst", createdAt: 2, tabs: [B] },
  ];

  const result = await ctx.evaluate(`moveTabBetweenSnapshots("src", 0, "dst", "${A.url}")`);

  assert.equal(byId(ctx, "src"), undefined);
  assert.deepEqual(urls(byId(ctx, "dst")), [B.url, A.url]);
  const trashed = ctx.store.tabby_trash.find((t) => t.id === "src");
  assert.equal(trashed.customName, "Lisbon");
  assert.equal(trashed.trashType, "snapshot");
  assert.deepEqual(urls(trashed), [A.url]);

  await ctx.evaluate(`undoMoveTab(${JSON.stringify(result.undo)})`);
  assert.equal(byId(ctx, "src").customName, "Lisbon");
  assert.equal(byId(ctx, "src").starred, true);
  assert.equal("trashType" in byId(ctx, "src"), false);
  assert.deepEqual(urls(byId(ctx, "dst")), [B.url]);
  assert.equal(ctx.store.tabby_trash.length, 0);
});

test("undoing a move into a snapshot that already had the page leaves that snapshot alone", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [
    { id: "src", createdAt: 1, tabs: [A, B] },
    { id: "dst", createdAt: 2, tabs: [A] },
  ];

  const result = await ctx.evaluate(`moveTabBetweenSnapshots("src", 0, "dst", "${A.url}")`);
  assert.equal(result.duplicated, true);

  await ctx.evaluate(`undoMoveTab(${JSON.stringify(result.undo)})`);
  assert.deepEqual(urls(byId(ctx, "src")), [A.url, B.url]);
  assert.deepEqual(urls(byId(ctx, "dst")), [A.url]);
});

test("a move is refused when the tab at that position is not the expected one", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [
    { id: "src", createdAt: 1, tabs: [A, B] },
    { id: "dst", createdAt: 2, tabs: [] },
  ];

  const result = await ctx.evaluate(`moveTabBetweenSnapshots("src", 0, "dst", "${B.url}")`);

  assert.equal(result.success, false);
  assert.deepEqual(urls(byId(ctx, "src")), [A.url, B.url]);
});
