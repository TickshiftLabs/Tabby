const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

function load(tabsInWindow = []) {
  const ctx = loadScripts("lib/urls.js", "lib/domains.js", "storage/dedup.js", "storage/snapshots.js", "background/actions.js");
  const badges = [];
  const titles = [];
  ctx.chrome.action = {
    setBadgeText: ({ text }) => badges.push(text),
    setBadgeBackgroundColor: () => {},
    setTitle: ({ title }) => titles.push(title),
  };
  ctx.chrome.tabs = { query: async () => tabsInWindow };
  const run = (expr) => ctx.evaluate(expr);
  return { ctx, badges, titles, run };
}

const PAGE = { url: "https://a.test/", title: "A", windowId: 1 };

test("saving a tab shows a tick", async () => {
  const { badges, titles, run } = load();
  await run(`saveThisTab(${JSON.stringify(PAGE)})`);
  assert.equal(badges[0], "✓");
  assert.match(titles[0], /Saved/);
});

test("a page that cannot be saved does not show a tick", async () => {
  const { ctx, badges, titles, run } = load();
  await run('saveThisTab({ url: "chrome://extensions", title: "Extensions" })');
  assert.equal(badges[0], "!");
  assert.match(titles[0], /can.t be saved/);
  assert.equal(ctx.store.tabby_snapshots, undefined);
});

test("saving the same tab twice says it is already saved", async () => {
  const { badges, titles, run } = load();
  await run(`saveThisTab(${JSON.stringify(PAGE)})`);
  await run(`saveThisTab(${JSON.stringify(PAGE)})`);
  assert.equal(badges[1], "✓");
  assert.match(titles[1], /Already saved/);
});

test("a window with nothing saveable does not show a tick", async () => {
  const { badges, run } = load([{ url: "chrome://newtab/" }, { url: "about:blank" }]);
  await run("saveThisWindow(1)");
  assert.equal(badges[0], "!");
});

test("saving a window shows a tick and how many tabs were saved", async () => {
  const { badges, titles, run } = load([PAGE, { url: "https://b.test/", title: "B", windowId: 1 }, { url: "chrome://newtab/" }]);
  await run("saveThisWindow(1)");
  assert.equal(badges[0], "✓");
  assert.match(titles[0], /Saved 2 tabs/);
});
