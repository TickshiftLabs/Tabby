const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

function load(openTabs) {
  const ctx = loadScripts("library/open.js");
  // Arguments come from the vm realm; copy them so deepEqual compares plain data.
  const calls = [];
  const record = (...call) => calls.push(JSON.parse(JSON.stringify(call)));
  ctx.chrome.runtime.getURL = (path) => `chrome-extension://tabbyid/${path}`;
  ctx.chrome.tabs = {
    query: async () => openTabs,
    update: async (id, props) => record("tabs.update", id, props),
    create: async (props) => record("tabs.create", props),
  };
  ctx.chrome.windows = { update: async (id, props) => record("windows.update", id, props) };
  return { ctx, calls };
}

const LIB = "chrome-extension://tabbyid/library.html";

test("opens a new Library tab when none is open", async () => {
  const { ctx, calls } = load([{ id: 1, windowId: 1, url: "https://example.com/" }]);
  await ctx.evaluate("openLibraryTab()");
  assert.deepEqual(calls, [["tabs.create", { url: LIB }]]);
});

test("switches to a Library tab that is already open", async () => {
  const { ctx, calls } = load([{ id: 7, windowId: 3, url: `${LIB}#snapshot=old` }]);
  await ctx.evaluate("openLibraryTab()");
  assert.deepEqual(calls, [
    ["tabs.update", 7, { active: true }],
    ["windows.update", 3, { focused: true }],
  ]);
});

test("points the open Library tab at a snapshot when one is asked for", async () => {
  const { ctx, calls } = load([{ id: 7, windowId: 3, url: LIB }]);
  await ctx.evaluate('openLibraryTab("snap 1")');
  assert.deepEqual(calls[0], ["tabs.update", 7, { active: true, url: `${LIB}#snapshot=snap%201` }]);
});

test("a new Library tab opens on the snapshot asked for", async () => {
  const { ctx, calls } = load([]);
  await ctx.evaluate('openLibraryTab("s1")');
  assert.deepEqual(calls, [["tabs.create", { url: `${LIB}#snapshot=s1` }]]);
});

test("pages of other extensions are not mistaken for the Library", async () => {
  const { ctx, calls } = load([{ id: 2, windowId: 1, url: "chrome-extension://other/library.html" }]);
  await ctx.evaluate("openLibraryTab()");
  assert.equal(calls[0][0], "tabs.create");
});
