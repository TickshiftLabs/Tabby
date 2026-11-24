const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

const load = () =>
  loadScripts("lib/urls.js", "lib/domains.js", "storage/dedup.js", "storage/snapshots.js", "storage/trash.js");

test("moveAllSnapshotsToTrash moves every snapshot and keeps existing trash", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [
    { id: "a", createdAt: 1, starred: true, tabs: [{ url: "https://a.test/" }] },
    { id: "b", createdAt: 2, tabs: [{ url: "https://b.test/" }] },
  ];
  ctx.store.tabby_trash = [{ id: "old", trashType: "snapshot", deletedAt: 5, tabs: [] }];

  const moved = await ctx.evaluate("moveAllSnapshotsToTrash()");

  assert.equal(moved, 2);
  assert.equal(ctx.store.tabby_snapshots.length, 0);
  assert.equal(ctx.store.tabby_trash.length, 3);
  const added = ctx.store.tabby_trash.filter((item) => item.id !== "old");
  for (const item of added) {
    assert.equal(item.trashType, "snapshot");
    assert.equal(typeof item.deletedAt, "number");
  }
  assert.equal(added.find((item) => item.id === "a").starred, true);
});

test("moveAllSnapshotsToTrash with nothing to move leaves trash alone", async () => {
  const ctx = load();
  ctx.store.tabby_trash = [{ id: "old", trashType: "snapshot", deletedAt: 5, tabs: [] }];

  const moved = await ctx.evaluate("moveAllSnapshotsToTrash()");

  assert.equal(moved, 0);
  assert.equal(ctx.store.tabby_trash.length, 1);
});

test("a snapshot moved by moveAllSnapshotsToTrash can be restored", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [{ id: "a", createdAt: 1, tabs: [{ url: "https://a.test/" }] }];

  await ctx.evaluate("moveAllSnapshotsToTrash()");
  await ctx.evaluate('restoreFromTrash("a")');

  assert.equal(ctx.store.tabby_snapshots.length, 1);
  assert.equal(ctx.store.tabby_snapshots[0].id, "a");
  assert.equal("deletedAt" in ctx.store.tabby_snapshots[0], false);
  assert.equal(ctx.store.tabby_trash.length, 0);
});

const A = { url: "https://a.test/", title: "A" };
const B = { url: "https://b.test/", title: "B" };
const C = { url: "https://c.test/", title: "C" };
const urls = (snapshot) => snapshot.tabs.map((t) => t.url);

test("moveTabToTrash refuses when the tab at that position is not the expected one", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [{ id: "s", createdAt: 1, tabs: [A, B, C] }];

  const first = await ctx.evaluate(`moveTabToTrash("s", 0, "${A.url}")`);
  const second = await ctx.evaluate(`moveTabToTrash("s", 0, "${A.url}")`);

  assert.equal(first.success, true);
  assert.equal(second.success, false);
  assert.deepEqual(urls(ctx.store.tabby_snapshots[0]), [B.url, C.url]);
  assert.equal(ctx.store.tabby_trash.length, 1);
});

test("undoTabTrash puts the trashed tab back into its snapshot", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [{ id: "s", createdAt: 1, tabs: [A, B, C] }];

  const removed = await ctx.evaluate(`moveTabToTrash("s", 1, "${B.url}")`);
  const undone = await ctx.evaluate(`undoTabTrash("${removed.trashId}")`);

  assert.equal(undone, true);
  assert.deepEqual(urls(ctx.store.tabby_snapshots[0]).sort(), [A.url, B.url, C.url]);
  assert.equal(ctx.store.tabby_trash.length, 0);
});

test("undoTabTrash restores the tab on its own when its snapshot is gone", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [{ id: "s", createdAt: 1, tabs: [A, B] }];

  const removed = await ctx.evaluate(`moveTabToTrash("s", 1, "${B.url}")`);
  ctx.store.tabby_snapshots = [];
  await ctx.evaluate(`undoTabTrash("${removed.trashId}")`);

  assert.equal(ctx.store.tabby_snapshots.length, 1);
  assert.deepEqual(urls(ctx.store.tabby_snapshots[0]), [B.url]);
  assert.equal(ctx.store.tabby_trash.length, 0);
});

test("undoTabTrash never deletes a different trash item", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [{ id: "s", createdAt: 1, tabs: [A, B, C] }];

  const removedA = await ctx.evaluate(`moveTabToTrash("s", 0, "${A.url}")`);
  const removedB = await ctx.evaluate(`moveTabToTrash("s", 0, "${B.url}")`);
  await ctx.evaluate(`undoTabTrash("${removedB.trashId}")`);

  assert.deepEqual(urls(ctx.store.tabby_snapshots[0]).sort(), [B.url, C.url]);
  assert.equal(ctx.store.tabby_trash.length, 1);
  assert.equal(ctx.store.tabby_trash[0].id, removedA.trashId);
  assert.equal(ctx.store.tabby_trash[0].tabs[0].url, A.url);
});

test("restoreManyFromTrash brings back the given snapshots and ignores unknown ids", async () => {
  const ctx = load();
  ctx.store.tabby_snapshots = [
    { id: "a", createdAt: 1, tabs: [A] },
    { id: "b", createdAt: 2, tabs: [B] },
  ];
  ctx.store.tabby_trash = [{ id: "old", trashType: "snapshot", deletedAt: 5, tabs: [C] }];
  await ctx.evaluate("moveAllSnapshotsToTrash()");

  const restored = await ctx.evaluate('restoreManyFromTrash(["a", "b", "missing"])');

  assert.equal(restored, 2);
  assert.deepEqual(ctx.store.tabby_snapshots.map((s) => s.id).sort(), ["a", "b"]);
  assert.equal("trashType" in ctx.store.tabby_snapshots[0], false);
  assert.deepEqual(ctx.store.tabby_trash.map((t) => t.id), ["old"]);
});
