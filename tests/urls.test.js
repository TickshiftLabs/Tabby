const test = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/load");

const ctx = loadScripts("lib/urls.js");
const ok = (tab) => ctx.evaluate(`isSaveableTab(${JSON.stringify(tab)}, "tabbyid")`);

test("web pages are saveable", () => assert.equal(ok({ url: "https://example.com/a" }), true));

test("discarded tab uses pendingUrl", () =>
  assert.equal(ok({ url: "", pendingUrl: "https://example.com" }), true));

test("suspended tab resolves to its real url", () =>
  assert.equal(ok({ url: "chrome-extension://other/suspended.html?url=https%3A%2F%2Fexample.com" }), true));

for (const url of [
  "chrome://extensions",
  "about:blank",
  "edge://settings",
  "brave://settings",
  "chrome-extension://tabbyid/library.html",
  "chrome-extension://other/options.html",
  "",
]) {
  test(`not saveable: ${url || "(empty)"}`, () => assert.equal(ok({ url }), false));
}
