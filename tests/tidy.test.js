const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

const ctx = loadScripts("lib/urls.js", "library/tidy-model.js");
const call = (fn, ...args) =>
  JSON.parse(ctx.evaluate(`JSON.stringify(${fn}(${args.map((a) => JSON.stringify(a)).join(",")}))`));
const ids = (tabs) => tabs.map((t) => t.id);

const open = [
  { id: 1, url: "https://docs.rs/tokio/" }, // saved (trailing slash ignored)
  { id: 2, url: "https://docs.rs/tokio#features", lastAccessed: 5 }, // saved, duplicate of 1
  { id: 3, url: "https://new.test/" }, // not saved
  { id: 4, url: "chrome://extensions" }, // never listed
  { id: 5, url: "chrome-extension://tabbyid/library.html" }, // never listed
  { id: 6, url: "https://docs.rs/tokio", pinned: true }, // pinned: never offered for closing
  { id: 7, url: "https://new.test/", active: true }, // duplicate of 3, active
];
const snapshots = [{ id: "a", tabs: [{ url: "https://docs.rs/tokio" }] }];

test("already-saved tabs are open, saveable, unpinned and in a snapshot", () => {
  assert.deepEqual(ids(call("findAlreadySavedTabs", open, snapshots, "tabbyid")), [1, 2]);
});

test("duplicates keep the active tab", () => {
  const groups = call("findDuplicateOpenTabs", open, "tabbyid");
  const group = groups.find((g) => g.url.includes("new.test"));
  assert.equal(group.keep.id, 7);
  assert.deepEqual(ids(group.close), [3]);
});

test("duplicates otherwise keep the most recently used tab", () => {
  const groups = call("findDuplicateOpenTabs", open, "tabbyid");
  const group = groups.find((g) => g.url.includes("docs.rs"));
  assert.equal(group.keep.id, 2);
  assert.deepEqual(ids(group.close), [1]);
});

test("internal pages, Tabby's own page and pinned tabs are never offered", () => {
  const groups = call("findDuplicateOpenTabs", open, "tabbyid");
  assert.equal(groups.length, 2);
  const offered = groups.flatMap((g) => [g.keep.id, ...ids(g.close)]);
  for (const id of [4, 5, 6]) assert.equal(offered.includes(id), false);
});

test("no open tabs means nothing to tidy", () => {
  assert.deepEqual(call("findAlreadySavedTabs", [], snapshots, "tabbyid"), []);
  assert.deepEqual(call("findDuplicateOpenTabs", [], "tabbyid"), []);
});

test("snapshots without tabs are tolerated", () => {
  assert.deepEqual(call("findAlreadySavedTabs", open, [{ id: "x" }], "tabbyid"), []);
});

test("another extension's page is never offered, even if it carries a saved URL", () => {
  const viewer = { id: 8, url: "chrome-extension://other/viewer.html?file=https://docs.rs/tokio" };
  assert.deepEqual(ids(call("findAlreadySavedTabs", [viewer], snapshots, "tabbyid")), []);
  const groups = call("findDuplicateOpenTabs", [viewer, { id: 9, url: "https://docs.rs/tokio" }], "tabbyid");
  assert.deepEqual(groups, []);
});

test("only tabs still listed after a fresh look are closed", () => {
  const planned = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const fresh = [{ id: 3 }, { id: 1 }, { id: 9 }];
  assert.deepEqual(ids(call("tabsStillListed", planned, fresh)), [1, 3]);
});

test("tidy signature changes only when the result changes", () => {
  const saved = [{ id: 1 }, { id: 2 }];
  const dups = [{ url: "u", keep: { id: 7 }, close: [{ id: 3 }] }];
  const sig = (a, b) => ctx.evaluate(`tidySignature(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
  assert.equal(sig(saved, dups), sig([{ id: 1 }, { id: 2 }], dups));
  assert.notEqual(sig(saved, dups), sig([{ id: 1 }], dups));
  assert.notEqual(sig(saved, dups), sig(saved, []));
});
